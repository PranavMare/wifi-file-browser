// server/routes/list.js
import { Router } from "express";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import { safeResolve, toUrlPath } from "../utils/paths.js";
import { categoryFor } from "../utils/categories.js";

export default function listRoutes({ BASE_DIR }) {
  const r = Router();

  r.get("/api/list", async (req, res) => {
    try {
      const rel = (req.query.path || "").trim();
      const dir = safeResolve(BASE_DIR, rel);

      let dirents;
      try {
        dirents = await fsp.readdir(dir, { withFileTypes: true });
      } catch (e) {
        console.warn("readdir failed:", e?.message);
        return res.json([]);
      }

      const results = await Promise.allSettled(
        dirents.map(async (d) => {
          const name = d.name;
          const full = path.join(dir, name);
          try {
            const st = await fsp.stat(full);
            const isDir = d.isDirectory();
            const relPath = rel ? path.join(rel, name) : name;
            const urlPath = toUrlPath(relPath);
            const cat = isDir ? "dir" : categoryFor(name);

            return {
              name,
              is_dir: isDir,
              size: isDir ? 0 : st.size,
              mtime: new Date(st.mtimeMs).toISOString().replace("T", " ").slice(0, 19),
              mtime_ts: Math.floor(st.mtimeMs / 1000),
              file: isDir ? null : `/file/${urlPath}`,
              download: isDir ? null : `/download/${urlPath}`,
              thumb: !isDir && cat === "image" ? `/thumb/${urlPath}` : null,
              category: isDir ? "dir" : cat,
            };
          } catch (e) {
            if (e?.code === "ENOENT") return null;
            console.warn("stat failed:", full, e?.message || e);
            return null;
          }
        })
      );

      const items = results.filter((r) => r.status === "fulfilled" && r.value).map((r) => r.value);
      res.json(items);
    } catch (e) {
      console.error("list error:", e);
      res.status(e.message === "Forbidden" ? 403 : 500).send("Server error");
    }
  });

  return r;
}
