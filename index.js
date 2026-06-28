const express = require("express");
const axios = require("axios");
require("dotenv").config();

// Khởi tạo Firebase Admin SDK
const admin = require("firebase-admin");

admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
});

const db = admin.firestore();

const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.get("/", (req, res) => {
    res.send("Server OK");
});

// Chuyển sang Discord (Đã thêm scope=email)
app.get("/auth/discord", (req, res) => {
    const url =
        `https://discord.com/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=identify%20email`; // %20 là dấu cách giữa identify và email

    res.redirect(url);
});

// Discord trả về đây
app.get("/auth/discord/callback", async (req, res) => {
    try {
        const code = req.query.code;

        // Lấy Access Token (Đã đồng bộ thêm tham số scope)
        const token = await axios.post(
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

        // Lấy thông tin Discord người dùng
        const user = await axios.get(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization: `Bearer ${token.data.access_token}`,
                },
            }
        );

        const discordUser = user.data;

        // Lưu thông tin người dùng vào Firestore (Có kèm email)
        await db.collection("users").doc(discordUser.id).set(
            {
                id: discordUser.id,
                username: discordUser.username,
                global_name: discordUser.global_name || null,
                avatar: discordUser.avatar,
                discriminator: discordUser.discriminator,
                email: discordUser.email || null,
                lastLogin: Date.now(),
            },
            { merge: true }
        );

        // Trả về kết quả JSON thành công
        res.json({
            success: true,
            user: discordUser,
        });

    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Đăng nhập thất bại");
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server chạy ở cổng ${PORT}`);
});

