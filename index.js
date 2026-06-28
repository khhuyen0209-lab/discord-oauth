const express = require("express"); const axios = require("axios"); 
require("dotenv").config(); const session = require("express-session");
// Firebase Admin SDK
const admin = require("firebase-admin"); const { initializeApp, cert } = 
require("firebase-admin/app"); const { getFirestore } = 
require("firebase-admin/firestore");
// Init Firebase
initializeApp({ credential: cert({ projectId: 
        process.env.FIREBASE_PROJECT_ID, clientEmail: 
        process.env.FIREBASE_CLIENT_EMAIL, privateKey: 
        process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
});
const db = getFirestore(); const app = express();
// 🔥 FIX SESSION CHO RAILWAY + DISCORD OAUTH
app.set("trust proxy", 1); app.use(session({ secret: 
    process.env.SESSION_SECRET, resave: false, saveUninitialized: false, 
    cookie: {
        secure: true, // HTTPS bắt buộc trên Railway sameSite: "none", // 
        QUAN TRỌNG cho OAuth Discord maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));
// ENV
const CLIENT_ID = process.env.CLIENT_ID; const CLIENT_SECRET = 
process.env.CLIENT_SECRET; const REDIRECT_URI = process.env.REDIRECT_URI;
// Test server
app.get("/", (req, res) => { res.send("Server OK");
});
// ======================= LOGIN DISCORD =======================
app.get("/auth/discord", (req, res) => { const url = 
        `https://discord.com/oauth2/authorize` + `?client_id=${CLIENT_ID}` 
        + `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` + 
        `&response_type=code` + `&scope=identify%20email`;
    res.redirect(url);
});
// ======================= CALLBACK DISCORD =======================
app.get("/auth/discord/callback", async (req, res) => { try { const code = 
        req.query.code;
        // Get token
        const tokenRes = await axios.post( 
            "https://discord.com/api/oauth2/token", new URLSearchParams({
                client_id: CLIENT_ID, client_secret: CLIENT_SECRET, 
                grant_type: "authorization_code", code, redirect_uri: 
                REDIRECT_URI, scope: "identify email",
            }),
            { headers: { "Content-Type": 
                    "application/x-www-form-urlencoded",
                },
            }
        ); const accessToken = tokenRes.data.access_token;
        // Get user
        const userRes = await axios.get( 
            "https://discord.com/api/users/@me", {
                headers: { Authorization: `Bearer ${accessToken}`,
                },
            }
        ); const user = userRes.data;
        // 🔥 SET SESSION
        req.session.discordId = user.id;
        // Save Firestore
        await db.collection("users").doc(user.id).set({ id: user.id, 
            username: user.username, global_name: user.global_name || null, 
            avatar: user.avatar, discriminator: user.discriminator, email: 
            user.email || null, lastLogin: Date.now(),
        }, { merge: true });
        // Save session before response
        req.session.save(() => { res.send("Đăng nhập thành công!");
        });
    } catch (err) {
        console.error(err.response?.data || err.message); 
        res.status(500).send("Đăng nhập thất bại");
    }
});
// ======================= GET USER INFO =======================
app.get("/api/me", async (req, res) => { try { if (!req.session.discordId) 
        {
            return res.status(401).json({ success: false, message: "Chưa 
                đăng nhập"
            });
        }
        const doc = await db .collection("users") 
            .doc(req.session.discordId) .get();
        if (!doc.exists) { return res.status(404).json({ success: false, 
                message: "Không tìm thấy user"
            });
        }
        res.json({ success: true, user: doc.data()
        });
    } catch (err) {
        console.error(err); res.status(500).json({ success: false, message: 
            "Lỗi server"
        });
    }
});
// ======================= LOGOUT (optional nhưng nên có) 
// =======================
app.get("/logout", (req, res) => { req.session.destroy(() => { res.send("Đã 
        logout");
    });
});
// =======================
const PORT = process.env.PORT || 3000; app.listen(PORT, "0.0.0.0", () => { 
    console.log(`Server chạy ở cổng ${PORT}`);
});
