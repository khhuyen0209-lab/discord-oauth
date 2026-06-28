const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();
const session = require("express-session");

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
app.use(express.json());

// ================= TRUST PROXY =================
app.set("trust proxy", 1);

// ================= CORS =================
app.use(cors({
    origin: "https://hydyar-yura.web.app",
    credentials: true
}));

// ================= SESSION =================
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

// ================= FIREBASE =================
initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
});

const db = getFirestore();

// ================= ENV =================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

// ================= LOGIN =================
app.get("/auth/discord", (req, res) => {
    const url =
        `https://discord.com/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=identify%20email`;

    res.redirect(url);
});

// ================= CALLBACK =================
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

        // SESSION
        req.session.discordId = user.id;

        // SAVE FIRESTORE
        await db.collection("users").doc(user.id).set({
            id: user.id,
            username: user.username,
            global_name: user.global_name || null,
            avatar: user.avatar,
            lastLogin: Date.now()
        }, { merge: true });

        req.session.save(() => {
            res.redirect("https://hydyar-yura.web.app");
        });

    } catch (err) {
        console.error("OAuth error:", err.response?.data || err.message);
        res.status(500).send("Login failed");
    }
});

// ================= API ME =================
app.get("/api/me", async (req, res) => {

    if (!req.session.discordId) {
        return res.json({ success: false });
    }

    const doc = await db.collection("users")
        .doc(req.session.discordId)
        .get();

    if (!doc.exists) {
        return res.json({ success: false });
    }

    res.json({
        success: true,
        user: doc.data()
    });
});

// ================= LOGOUT =================
app.get("/logout", (req, res) => {
    req.session.destroy(() => {
        res.redirect("https://hydyar-yura.web.app");
    });
});

// ================= START =================
app.listen(process.env.PORT || 3000, () => {
    console.log("HydYar server running");
});
