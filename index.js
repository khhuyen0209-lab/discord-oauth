const express = require("express");
const axios = require("axios");
require("dotenv").config();
const session = require("express-session");

// Firebase Admin SDK
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// =======================
// INIT FIREBASE
// =======================
initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
});

const db = getFirestore();

// =======================
// EXPRESS APP
// =======================
const app = express();

// =======================
// SESSION CONFIG (RAILWAY FIX)
// =======================
app.set("trust proxy", 1);

app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: true,
        sameSite: "none",
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

// =======================
// ENV
// =======================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// =======================
// HOME ROUTE (SERVER OK + LOGIN STATE)
// =======================
app.get("/", (req, res) => {
    if (!req.session.discordId) {
        return res.send(`
            <h1>Server OK 🚀</h1>
            <p>Chưa login</p>
            <a href="/auth/discord">Login Discord</a>
        `);
    }

    res.send(`
        <h1>Server OK 🚀</h1>
        <p>Đã login Discord ✔</p>
        <a href="/api/me">Xem profile</a><br>
        <a href="/logout">Logout</a>
    `);
});

// =======================
// LOGIN DISCORD
// =======================
app.get("/auth/discord", (req, res) => {
    const url =
        `https://discord.com/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=identify%20email`;

    res.redirect(url);
});

// =======================
// CALLBACK DISCORD
// =======================
app.get("/auth/discord/callback", async (req, res) => {
    try {
        const code = req.query.code;

        // GET TOKEN
        const tokenRes = await axios.post(
            "https://discord.com/api/oauth2/token",
            new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
                scope: "identify email",
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        const accessToken = tokenRes.data.access_token;

        // GET USER
        const userRes = await axios.get(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const user = userRes.data;

        // =======================
        // SET SESSION
        // =======================
        req.session.discordId = user.id;

        // SAVE FIRESTORE
        await db.collection("users").doc(user.id).set({
            id: user.id,
            username: user.username,
            global_name: user.global_name || null,
            avatar: user.avatar,
            discriminator: user.discriminator,
            email: user.email || null,
            lastLogin: Date.now(),
        }, { merge: true });

        // SAVE SESSION THEN REDIRECT
        req.session.save(() => {
            res.redirect("/");
        });

    } catch (err) {
        console.error("DISCORD ERROR:", err.response?.data || err.message);
        res.status(500).send("Đăng nhập thất bại");
    }
});

// =======================
// API ME
// =======================
app.get("/api/me", async (req, res) => {
    try {

        if (!req.session.discordId) {
            return res.status(401).json({
                success: false,
                message: "Chưa đăng nhập"
            });
        }

        const doc = await db
            .collection("users")
            .doc(req.session.discordId)
            .get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: "Không tìm thấy user"
            });
        }

        return res.json({
            success: true,
            user: doc.data()
        });

    } catch (err) {
        console.error(err);

        return res.status(500).json({
            success: false,
            message: "Lỗi server"
        });
    }
});

// =======================
// LOGOUT
// =======================
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("/");
    });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server chạy ở cổng ${PORT}`);
});
