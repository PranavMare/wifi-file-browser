// server/routes/files.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import mime from "mime-types";
import { safeResolve } from "../utils/paths.js";

export default function filesRoutes({ BASE_DIR }) {
  const r = Router();

  // Range-aware file reader
  r.get(/^\/file\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);
      if (!st.isFile()) return res.sendStatus(404);

      const ext = path.extname(abs).slice(1).toLowerCase();
      const typeFromExt =
        {
          mp4: "video/mp4",
          m4v: "video/mp4",
          mov: "video/quicktime",
          webm: "video/webm",
          mkv: "video/x-matroska",
          avi: "video/x-msvideo",
          mpg: "video/mpeg",
          mpeg: "video/mpeg",
          mp3: "audio/mpeg",
          m4a: "audio/mp4",
          wav: "audio/wav",
          flac: "audio/flac",
          ogg: "audio/ogg",
          oga: "audio/ogg",
        }[ext] ||
        mime.lookup(abs) ||
        "application/octet-stream";

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
          "Content-Type": typeFromExt,
          "Cache-Control": "no-store",
        });
        fs.createReadStream(abs, { start, end, highWaterMark: 1 << 20 }).pipe(res);
      } else {
        res.writeHead(200, {
          "Content-Length": st.size,
          "Content-Type": typeFromExt,
          "Cache-Control": "no-store",
        });
        fs.createReadStream(abs, { highWaterMark: 1 << 20 }).pipe(res);
      }
    } catch (e) {
      if (e?.code === "ENOENT") return res.sendStatus(404);
      res.sendStatus(e?.message === "Forbidden" ? 403 : 500);
    }
  });

  // HEAD /file/*
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

  // Range-friendly download
  r.get(/^\/download\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);

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
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(abs)}"`);
        fs.createReadStream(abs, { start, end, highWaterMark: 1 << 20 }).pipe(res);
      } else {
        res.status(200);
        res.setHeader("Content-Length", st.size);
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader("Content-Disposition", `attachment; filename="${path.basename(abs)}"`);
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
