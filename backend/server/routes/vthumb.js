// server/routes/vthumb.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { safeResolve } from "../utils/paths.js";

export default function vthumbRoutes({ BASE_DIR, VTHUMB_DIR }) {
  const r = Router();

  r.get(/^\/vthumb\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);
      if (!st.isFile()) return res.sendStatus(404);

      const w = Math.max(1, Math.min(4096, parseInt(req.query.w ?? "360", 10)));
      const h = req.query.h ? Math.max(1, Math.min(4096, parseInt(req.query.h, 10))) : null;
      const fit = String(req.query.fit ?? "contain").toLowerCase();
      const fm = String(req.query.fm ?? "jpeg").toLowerCase(); // "jpeg" | "webp"
      const q = Math.max(1, Math.min(100, parseInt(req.query.q ?? "85", 10)));
      const t = Math.max(0, parseFloat(req.query.t ?? "1.0")); // seconds

      const key = crypto
        .createHash("md5")
        .update([abs, st.mtimeMs, w, h ?? "", fit, fm, q, t].join("|"))
        .digest("hex");

      const ext = fm === "webp" ? "webp" : "jpg";
      const outPath = path.join(VTHUMB_DIR, `${key}.${ext}`);
      await fsp.mkdir(VTHUMB_DIR, { recursive: true });

      if (!fs.existsSync(outPath)) {
        let vf = "";
        if (w && h) {
          if (fit === "contain") {
            vf = `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:white`;
          } else {
            vf = `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
          }
        } else if (w) {
          vf = `scale=${w}:-1:force_original_aspect_ratio=decrease`;
        }

        const ffmpeg = ffmpegStatic || "ffmpeg";
        const args = ["-hide_banner", "-loglevel", "error", "-ss", String(t), "-i", abs, "-frames:v", "1"];
        if (vf) args.push("-vf", vf);

        if (fm === "webp") {
          args.push("-vcodec", "libwebp", "-lossless", "0", "-q:v", String(q), outPath);
        } else {
          const mjpegQ = Math.max(2, Math.min(31, Math.round(31 - (q / 100) * 29)));
          args.push("-q:v", String(mjpegQ), outPath);
        }

        await new Promise((resolve, reject) => {
          const p = spawn(ffmpeg, args);
          let err = "";
          p.stderr.on("data", (d) => (err += d.toString()));
          p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg exit ${code}`))));
        });
      }

      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", `"${path.basename(outPath)}"`);
      res.type(ext).send(fs.readFileSync(outPath));
    } catch (e) {
      console.warn("vthumb error:", e?.message || e);
      res.sendStatus(404);
    }
  });

  return r;
}
