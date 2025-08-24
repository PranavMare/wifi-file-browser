// server/routes/video.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import mime from "mime-types";
import { safeResolve } from "../utils/paths.js";

export default function videoRoutes({ BASE_DIR }) {
  const r = Router();

  r.get(/^\/video\/(.+)$/, async (req, res) => {
    try {
      const rel = decodeURIComponent(req.params[0] || "");
      const abs = safeResolve(BASE_DIR, rel);
      const st = await fsp.stat(abs);
      if (!st.isFile()) return res.sendStatus(404);

      const contentType = mime.lookup(abs) || "application/octet-stream";
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", contentType);

      const range = req.headers.range;
      if (!range) {
        res.setHeader("Content-Length", st.size);
        return fs.createReadStream(abs).pipe(res);
      }

      const m = range.match(/bytes=(\d*)-(\d*)/);
      if (!m) return res.status(416).end();
      let start = m[1] ? parseInt(m[1], 10) : 0;
      let end = m[2] ? parseInt(m[2], 10) : Math.min(start + (1 << 20) - 1, st.size - 1);

      if (isNaN(start) || isNaN(end) || start > end || end >= st.size) {
        res.setHeader("Content-Range", `bytes */${st.size}`);
        return res.status(416).end();
      }

      res.status(206);
      res.setHeader("Content-Range", `bytes ${start}-${end}/${st.size}`);
      res.setHeader("Content-Length", end - start + 1);
      fs.createReadStream(abs, { start, end }).pipe(res);
    } catch (err) {
      console.error(err);
      res.sendStatus(404);
    }
  });

  return r;
}
