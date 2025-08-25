// server/routes/files.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import mime from "mime-types";
import { safeResolve } from "../utils/paths.js";

function contentTypeFor(absPath) {
  const ext = path.extname(absPath).slice(1).toLowerCase();
  // Prefer our explicit map, then fall back to mime-types, then octet-stream
  return (
    {
      // video
      mp4: "video/mp4",
      m4v: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      mkv: "video/x-matroska",
      avi: "video/x-msvideo",
      mpg: "video/mpeg",
      mpeg: "video/mpeg",
      // audio
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      flac: "audio/flac",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      // images (incl. HEIC/HEIF)
      heic: "image/heic",
      heif: "image/heif",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      gif: "image/gif",
      bmp: "image/bmp",
      svg: "image/svg+xml",
      // docs
      pdf: "application/pdf",
      txt: "text/plain; charset=utf-8",
      md: "text/markdown; charset=utf-8",
      csv: "text/csv; charset=utf-8",
      json: "application/json",
    }[ext] ||
    mime.lookup(absPath) ||
    "application/octet-stream"
  );
}

// RFC 5987 filename* support + ASCII fallback to avoid weird characters
function contentDispositionValue(filename) {
  const base = path.basename(filename);
  const asciiFallback = base.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(base).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16));
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export default function filesRoutes({ BASE_DIR }) {
  const r = Router();

  // -------- Range-aware file reader --------
  r.get(/^\/file\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);
      if (!st.isFile()) return res.sendStatus(404);

      const type = contentTypeFor(abs);
      res.setHeader("Accept-Ranges", "bytes");

      const range = req.headers.range;
      if (range) {
        let [startStr, endStr] = range.replace(/bytes=/, "").split("-");
        let start = parseInt(startStr, 10);
        let end = endStr ? parseInt(endStr, 10) : st.size - 1;

        if (Number.isNaN(start) || start < 0) start = 0;
        if (Number.isNaN(end) || end >= st.size) end = st.size - 1;
        if (start > end) {
          res.status(416).set("Content-Range", `bytes */${st.size}`).end();
          return;
        }

        res.writeHead(206, {
          "Content-Range": `bytes ${start}-${end}/${st.size}`,
          "Content-Length": end - start + 1,
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        fs.createReadStream(abs, { start, end, highWaterMark: 1 << 20 }).pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": st.size,
          "Content-Type": type,
          "Cache-Control": "no-store",
        });
        fs.createReadStream(abs, { highWaterMark: 1 << 20 }).pipe(res);
      }
    } catch (e) {
      if (e?.code === "ENOENT") return res.sendStatus(404);
      res.sendStatus(e?.message === "Forbidden" ? 403 : 500);
    }
  });

  // -------- HEAD /file/* --------
  r.head(/^\/file\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);
      if (!st.isFile()) return res.sendStatus(404);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Length", st.size);
      res.status(200).end();
    } catch {
      res.sendStatus(404);
    }
  });

  // -------- Range-friendly download --------
  r.get(/^\/download\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);
      if (!st.isFile()) return res.sendStatus(404);

      const type = contentTypeFor(abs);
      const dispo = contentDispositionValue(abs);

      res.setHeader("Accept-Ranges", "bytes");

      const range = req.headers.range;
      if (range) {
        const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
        const start = parseInt(startStr, 10);
        const end = endStr ? parseInt(endStr, 10) : st.size - 1;
        if (isNaN(start) || isNaN(end) || start > end || end >= st.size) {
          return res.status(416).set("Content-Range", `bytes */${st.size}`).end();
        }
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
        res.setHeader("Content-Length", end - start + 1);
        res.setHeader("Content-Type", type); // <- real MIME prevents .bin
        res.setHeader("Content-Disposition", dispo);
        fs.createReadStream(abs, { start, end, highWaterMark: 1 << 20 }).pipe(res);
      } else {
        res.status(200);
        res.setHeader("Content-Length", st.size);
        res.setHeader("Content-Type", type); // <- real MIME prevents .bin
        res.setHeader("Content-Disposition", dispo);
        fs.createReadStream(abs, { highWaterMark: 1 << 20 }).pipe(res);
      }
    } catch (e) {
      if (e?.code === "ENOENT") return res.sendStatus(404);
      console.error("download error:", e);
      res.sendStatus(500);
    }
  });

  return r;
}
