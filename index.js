const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();
const session = require("express-session");

// Firebase Admin SDK
const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// =======================
// INIT APP
// =======================
const app = express();

app.use(express.json());

// =======================
// TRUST PROXY (RAILWAY FIX)
// =======================
app.set("trust proxy", 1);

// =======================
// CORS FIX (QUAN TRỌNG NHẤT)
// =======================
app.use(cors({
    origin: "https://hydyar-yura.web.app",
    credentials: true
}));

// =======================
// SESSION (COOKIE FIX)
// =======================
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
// FIREBASE INIT
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
// ENV
// =======================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// =======================
// HEALTH CHECK
// =======================
app.get("/", (req, res) => {
    res.send("HydYar Server OK 🚀");
});

// =======================
// DISCORD LOGIN
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
// CALLBACK
// =======================
app.get("/auth/discord/callback", async (req, res) => {

    try {

        const code = req.query.code;

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
        // SESSION SAVE
        // =======================
        req.session.discordId = user.id;

        // =======================
        // FIRESTORE SAVE
        // =======================
        await db.collection("users").doc(user.id).set({
            id: user.id,
            username: user.username,
            global_name: user.global_name || null,
            avatar: user.avatar,
            discriminator: user.discriminator,
            email: user.email || null,
            lastLogin: Date.now(),
        }, { merge: true });

        req.session.save(() => {
            res.redirect("https://hydyar-yura.web.app");
        });

    } catch (err) {
        console.error("OAuth error:", err.response?.data || err.message);
        res.status(500).send("Login failed");
    }
});

// =======================
// API ME (AUTH SYNC)
// =======================
app.get("/api/me", async (req, res) => {

    try {

        if (!req.session.discordId) {
            return res.status(401).json({
                success: false,
                message: "Not logged in"
            });
        }

        const doc = await db
            .collection("users")
            .doc(req.session.discordId)
            .get();

        if (!doc.exists) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }

        res.json({
            success: true,
            user: doc.data()
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
});

// =======================
// LOGOUT
// =======================
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("https://hydyar-yura.web.app");
    });
});

// =======================
// START SERVER
// =======================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`HydYar server running on ${PORT}`);
});
