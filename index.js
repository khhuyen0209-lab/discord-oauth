const express = require("express");
const axios = require("axios");
const cors = require("cors");
require("dotenv").config();
const jwt = require("jsonwebtoken");

const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

const app = express();
app.use(express.json());

// ================= CORS =================
app.use(cors({
    origin: "https://hydyar-yura.web.app",
}));

// ================= FIREBASE =================
initializeApp({
    credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
});

const db = getFirestore();

// ================= ENV =================
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;
const JWT_SECRET = process.env.JWT_SECRET || "hydyar_secret";

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

        // GET TOKEN FROM DISCORD
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

        // GET USER INFO
        const userRes = await axios.get(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
            }
        );

        const user = userRes.data;

        // SAVE FIREBASE
        await db.collection("users").doc(user.id).set({
            id: user.id,
            username: user.username,
            global_name: user.global_name || null,
            avatar: user.avatar,
            lastLogin: Date.now()
        }, { merge: true });

        // CREATE JWT TOKEN
        const token = jwt.sign(
            {
                id: user.id,
                username: user.username,
                avatar: user.avatar
            },
            JWT_SECRET,
            { expiresIn: "7d" }
        );

        // 🚀 IMPORTANT: RETURN TOKEN TO FRONTEND
        res.redirect(`https://hydyar-yura.web.app/?token=${token}`);

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Login failed");
    }
});

// ================= VERIFY TOKEN =================
function auth(req, res, next) {

    const token = req.headers.authorization?.split(" ")[1];

    if (!token) return res.status(401).json({ success: false });

    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        return res.status(403).json({ success: false });
    }
}

// ================= API ME =================
app.get("/api/me", auth, async (req, res) => {

    const doc = await db.collection("users")
        .doc(req.user.id)
        .get();

    if (!doc.exists) {
        return res.json({ success: false });
    }

    res.json({
        success: true,
        user: doc.data()
    });
});

// ================= START =================
app.listen(process.env.PORT || 3000, () => {
    console.log("HydYar server running");
});
