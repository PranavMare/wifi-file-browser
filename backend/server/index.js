// server/index.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

import { CONFIG } from "./config.js";
import { createApp } from "./app.js";

process.on("uncaughtException", (err) => console.error("UNCAUGHT:", err));
process.on("unhandledRejection", (reason) => console.error("UNHANDLED REJECTION:", reason));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create app
const app = createApp();

// Serve React build from ./dist (behind the password gate)
const webRoot = path.join(__dirname, "dist");
app.use(express.static(webRoot));

// SPA fallback for "/" and "/browse/..."
app.get(/^(?:\/|\/browse\/.*)$/, (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

// Start server
app.listen(CONFIG.PORT, () => {
  console.log(`API + static server on http://0.0.0.0:${CONFIG.PORT}`);
  console.log(`Sharing: ${CONFIG.BASE_DIR}`);
  console.log(`Serving UI from: ${webRoot}`);
  console.log(`Password-only gate enabled. Change it with AUTH_PASS env var.`);
});
