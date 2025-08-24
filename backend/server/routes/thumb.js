// server/routes/thumb.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { safeResolve } from "../utils/paths.js";
import { CONFIG } from "../config.js";

let sharp = null;
try {
  const m = await import("sharp");
  sharp = m.default ?? m;
} catch {
  console.warn("sharp not installed; thumbnails will use originals");
}

export default function thumbRoutes({ BASE_DIR, CACHE_DIR = CONFIG.CACHE_DIR }) {
  const r = Router();

  r.get(/^\/thumb\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return res.sendStatus(404);

      if (!sharp) return res.sendFile(abs);

      const w = Math.max(1, Math.min(4096, parseInt(req.query.w ?? "360", 10)));
      const h = req.query.h ? Math.max(1, Math.min(4096, parseInt(req.query.h, 10))) : null;
      const fit = (req.query.fit || "contain").toString();
      const fm = (req.query.fm || "webp").toString().toLowerCase(); // webp | jpeg | avif
      const q = Math.max(1, Math.min(100, parseInt(req.query.q ?? "82", 10)));

      const st = fs.statSync(abs);
      const key = crypto
        .createHash("md5")
        .update([abs, st.mtimeMs, w, h ?? "", fit, fm, q].join("|"))
        .digest("hex");
      const ext = fm === "jpeg" ? "jpg" : fm;
      const outPath = path.join(CACHE_DIR, `${key}.${ext}`);
      await fsp.mkdir(CACHE_DIR, { recursive: true });

      if (!fs.existsSync(outPath)) {
        try {
          let pipe = sharp(abs, { failOnError: false })
            .rotate()
            .resize({
              width: w,
              height: h || null,
              fit,
              position: "centre",
              withoutEnlargement: true,
              kernel: sharp.kernel.lanczos3,
              fastShrinkOnLoad: true,
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            });

          if (fm === "jpeg" && h) {
            pipe = pipe.flatten({ background: "#ffffff" });
          } else if (fm === "avif") pipe = pipe.avif({ quality: q, effort: 4 });
          else if (fm === "webp") pipe = pipe.webp({ quality: q });
          else pipe = pipe.jpeg({ quality: q, progressive: true, mozjpeg: true });

          await pipe.toFile(outPath);
        } catch (err) {
          console.warn("thumb gen failed, fallback to original:", err?.message || err);
          return res.sendFile(abs);
        }
      }

      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", `"${key}"`);
      res.type(ext).send(fs.readFileSync(outPath));
    } catch (e) {
      if (e && e.code === "ENOENT") return res.sendStatus(404);
      console.error("thumb error:", e);
      res.sendStatus(e?.message === "Forbidden" ? 403 : 500);
    }
  });

  return r;
}
