const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();

const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT_URI = process.env.REDIRECT_URI;

app.get("/", (req, res) => {
    res.send("Server OK");
});

// Chuyển sang Discord
app.get("/auth/discord", (req, res) => {
    const url =
        `https://discord.com/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=identify`;

    res.redirect(url);
});

// Discord trả về đây
app.get("/auth/discord/callback", async (req, res) => {
    try {
        const code = req.query.code;

        const token = await axios.post(
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

        const user = await axios.get(
            "https://discord.com/api/users/@me",
            {
                headers: {
                    Authorization: `Bearer ${token.data.access_token}`,
                },
            }
        );

        res.json(user.data);
    } catch (err) {
        console.error(err.response?.data || err.message);
        res.status(500).send("Đăng nhập thất bại");
    }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server chạy ở cổng ${PORT}`);
});

