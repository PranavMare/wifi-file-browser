// server/index.js
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

import { CONFIG } from "./config.js";
import { createApp } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = createApp(); // mounts all API routes (list, file, thumb, vthumb, video)

const webRoot = path.resolve(__dirname, "../dist"); // dist is typically one level up from /server
app.use(express.static(webRoot)); // static AFTER the API routes

// SPA fallback LAST
app.get(/^(?:\/|\/browse\/.*)$/, (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(CONFIG.PORT, () => {
  console.log(`API + static server on http://0.0.0.0:${CONFIG.PORT}`);
  console.log(`Sharing: ${CONFIG.BASE_DIR}`);
  console.log(`Serving UI from: ${webRoot}`);
});
