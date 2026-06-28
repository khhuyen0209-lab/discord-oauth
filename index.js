const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("OK chạy rồi 🔥");
});

app.listen(3000, () => {
  console.log("Server chạy port 3000");
});

