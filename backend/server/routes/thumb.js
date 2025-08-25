// server/routes/thumb.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import { safeResolve } from "../utils/paths.js";
import { CONFIG } from "../config.js";

let sharp = null;
try {
  const m = await import("sharp");
  sharp = m.default ?? m;
} catch {
  console.warn("sharp not installed; thumbnails will use originals/transcoded JPEG when needed");
}

// Optional WASM fallback if FFmpeg can’t decode HEIC on your box
let heicConvert = null;
try {
  const m = await import("heic-convert");
  heicConvert = m.default ?? m;
} catch {
  // optional
}

const isHeicPath = (p) => /\.(heic|heif|heics|heifs)$/i.test(p);

async function ffmpegStillThumb({ input, outPath, w, h, fit, q }) {
  let vf = "";
  if (w && h) {
    vf =
      fit === "cover"
        ? `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`
        : `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:white`;
  } else if (w) {
    vf = `scale=${w}:-1:force_original_aspect_ratio=decrease`;
  }

  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", input, "-frames:v", "1"];
  if (vf) args.push("-vf", vf);

  // map q(1..100) to mjpeg qscale(2..31)
  const mjpegQ = Math.max(2, Math.min(31, Math.round(31 - (q / 100) * 29)));
  args.push("-q:v", String(mjpegQ), outPath);

  await new Promise((resolve, reject) => {
    const bin = ffmpegStatic || "ffmpeg";
    const p = spawn(bin, args);
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err || `ffmpeg exit ${code}`))));
  });
}

export default function thumbRoutes({ BASE_DIR, CACHE_DIR = CONFIG.CACHE_DIR }) {
  const r = Router();

  r.get(/^\/thumb\/(.+)$/, async (req, res) => {
    let handler = "unknown";
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return res.sendStatus(404);

      const w = Math.max(1, Math.min(4096, parseInt(req.query.w ?? "360", 10)));
      const h = req.query.h ? Math.max(1, Math.min(4096, parseInt(req.query.h, 10))) : null;
      const fit = String(req.query.fit ?? "contain").toLowerCase(); // contain | cover
      const requestedFm = String(req.query.fm ?? "webp").toLowerCase(); // webp | jpeg | avif
      const q = Math.max(1, Math.min(100, parseInt(req.query.q ?? "82", 10)));

      const st = fs.statSync(abs);
      const isHeic = isHeicPath(abs);

      // Decide final format we’ll actually return
      let finalFm = requestedFm;
      if (!sharp && (finalFm === "webp" || finalFm === "avif")) finalFm = "jpeg";
      if (!["webp", "jpeg", "avif"].includes(finalFm)) finalFm = "jpeg";
      // For HEIC, we will decode to JPEG first (FFmpeg or heic-convert), then optionally transcode to webp/avif
      const ext = finalFm === "jpeg" ? "jpg" : finalFm;

      const key = crypto
        .createHash("md5")
        .update([abs, st.mtimeMs, w, h ?? "", fit, finalFm, q].join("|"))
        .digest("hex");
      const outPath = path.join(CACHE_DIR, `${key}.${ext}`);
      await fsp.mkdir(CACHE_DIR, { recursive: true });

      if (!fs.existsSync(outPath)) {
        try {
          if (!isHeic && sharp) {
            // ---------- Non-HEIC via sharp ----------
            handler = "sharp";
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

            if (finalFm === "jpeg" && h) pipe = pipe.flatten({ background: "#ffffff" });
            if (finalFm === "avif") pipe = pipe.avif({ quality: q, effort: 4 });
            else if (finalFm === "webp") pipe = pipe.webp({ quality: q });
            else pipe = pipe.jpeg({ quality: q, progressive: true, mozjpeg: true });

            await pipe.toFile(outPath);
          } else if (isHeic) {
            // ---------- HEIC decode path (never let sharp read HEIC) ----------
            const tmpJpg = path.join(CACHE_DIR, `${key}.tmp.jpg`);

            // Try FFmpeg first
            try {
              handler = "ffmpeg";
              await ffmpegStillThumb({ input: abs, outPath: tmpJpg, w, h, fit, q });
            } catch (e1) {
              // Fall back to heic-convert (WASM), if present
              if (!heicConvert) throw e1;
              handler = "heic-convert";
              const buf = await fsp.readFile(abs);
              // heic-convert quality: 0–1
              const jpegBuf = await heicConvert({
                buffer: buf,
                format: "JPEG",
                quality: Math.max(0.01, Math.min(1, q / 100)),
              });
              await fsp.writeFile(tmpJpg, jpegBuf);
              // If using heic-convert (which doesn’t resize), do a resize pass via sharp if available
              if (sharp && (w || h)) {
                let pipe = sharp(tmpJpg, { failOnError: false })
                  .rotate()
                  .resize({
                    width: w || null,
                    height: h || null,
                    fit,
                    position: "centre",
                    withoutEnlargement: true,
                    kernel: sharp.kernel.lanczos3,
                    fastShrinkOnLoad: true,
                    background: { r: 255, g: 255, b: 255, alpha: 1 },
                  });
                await pipe.toFile(tmpJpg); // overwrite tmp with resized
              }
            }

            if (finalFm === "jpeg" || !sharp) {
              // Serve jpeg directly
              if (tmpJpg !== outPath) {
                await fsp.rename(tmpJpg, outPath).catch(async () => {
                  const b = await fsp.readFile(tmpJpg);
                  await fsp.writeFile(outPath, b);
                  await fsp.unlink(tmpJpg).catch(() => {});
                });
              }
            } else {
              // Transcode to requested format using sharp (from the decoded JPEG)
              let pipe = sharp(tmpJpg, { failOnError: false });
              if (finalFm === "avif") pipe = pipe.avif({ quality: q, effort: 4 });
              else pipe = pipe.webp({ quality: q });
              await pipe.toFile(outPath);
              try {
                await fsp.unlink(tmpJpg);
              } catch {}
            }
          } else {
            // ---------- No sharp & non-HEIC: send original (can’t resize) ----------
            handler = "original";
            return res.sendFile(abs);
          }
        } catch (err) {
          console.warn("thumb gen failed, fallback to original:", err?.message || err);
          handler = "fallback-original-error";
          return res.sendFile(abs);
        }
      } else {
        handler = "cache";
      }

      res.setHeader("X-Thumb-Handler", handler);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("ETag", `"${path.basename(outPath)}"`);
      const extOut = path.extname(outPath).slice(1) || ext;
      res.type(extOut).send(fs.readFileSync(outPath));
    } catch (e) {
      console.error("thumb error:", e);
      res.setHeader("X-Thumb-Handler", `error:${String(e?.code || "")}`);
      if (e && e.code === "ENOENT") return res.sendStatus(404);
      res.sendStatus(e?.message === "Forbidden" ? 403 : 500);
    }
  });

  return r;
}
