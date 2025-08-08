// server.js (ES modules) — serves ./dist
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import { promises as fsp } from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import cookieParser from "cookie-parser";
import mime from "mime-types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Env-configurable values (moved out of source) =====
const PASSWORD = String(process.env.AUTH_PASS || ""); // REQUIRED
const COOKIE_SECRET = String(process.env.COOKIE_SECRET || ""); // REQUIRED
const COOKIE_NAME = process.env.COOKIE_NAME || "wf_auth";
const BASE_DIR = process.env.BASE_DIR || path.resolve(process.cwd()); // default to CWD if not set
const PORT = Number(process.env.PORT || 3000);

if (!PASSWORD) console.warn("⚠️  AUTH_PASS not set — login will always fail.");
if (!COOKIE_SECRET) console.warn("⚠️  COOKIE_SECRET not set — signing cookies is insecure.");
if (!process.env.BASE_DIR) console.warn(`ℹ️  BASE_DIR not set — defaulting to ${BASE_DIR}`);

const VTHUMB_DIR = path.resolve(".cache/vthumbs");
const CACHE_DIR = path.resolve(".cache/thumbs");

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:", reason);
});

let sharp = null;
try {
  const m = await import("sharp");
  sharp = m.default ?? m;
} catch {
  console.warn("sharp not installed; thumbnails will use originals");
}

const app = express();
app.disable("x-powered-by");

// 1) PARSERS — must run BEFORE the auth gate & routes
app.use(cookieParser(COOKIE_SECRET));
app.use(express.urlencoded({ extended: false })); // for POST /login (form)
app.use(express.json()); // if you accept JSON bodies
app.use(cors());

// 2) PASSWORD GATE — redirects browsers to /login unless cookie is set
function passwordGate(req, res, next) {
  if (req.method === "OPTIONS") return next();
  if (req.path === "/login" || req.path === "/logout") return next();
  if (req.signedCookies?.[COOKIE_NAME] === "ok") return next();
  if (req.accepts("html")) return res.redirect(302, "/login");
  return res.status(401).send("Password required.");
}
app.use(passwordGate);

// 3) AUTH ROUTES — reachable even when not authenticated
app.get("/login", (req, res) => {
  const error = req.query.e ? "Incorrect password." : "";
  res.type("html").send(`<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Enter Password</title>
<style>
  :root{color-scheme:dark}
  body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;background:#0b0b0c;color:#eee;display:grid;min-height:100vh;place-items:center}
  .card{width:min(420px,90vw);background:#141416;border:1px solid #2a2a2e;border-radius:14px;padding:20px;box-shadow:0 10px 30px rgba(0,0,0,.4)}
  h1{margin:0 0 10px 0;font-size:18px}
  form{display:flex;gap:8px;margin-top:10px}
  input[type=password]{flex:1;padding:10px;border-radius:10px;border:1px solid #2b2b2f;background:#0f0f11;color:#fff}
  button{padding:10px 14px;border-radius:10px;border:1px solid #3a3a40;background:#2a2a31;color:#fff;cursor:pointer}
  .err{color:#ff6b6b;margin-top:10px;min-height:1.2em}
</style>
<div class="card">
  <h1>Enter password</h1>
  <form method="post" action="/login">
    <input type="password" name="password" placeholder="Password" autofocus aria-label="Password" />
    <button type="submit">Unlock</button>
  </form>
  <div class="err">${error}</div>
</div>
</html>`);
});

app.post("/login", (req, res) => {
  const pass = String(req.body?.password || "");
  const ok = PASSWORD && pass.length === PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(PASSWORD));
  if (!ok) return res.redirect(302, "/login?e=1");

  res.cookie(COOKIE_NAME, "ok", {
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
  res.redirect(302, "/");
});

app.get("/logout", (req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.redirect(302, "/login");
});

function safeResolve(rel = "") {
  const abs = path.resolve(BASE_DIR, rel);
  const baseAbs = path.resolve(BASE_DIR);
  if (!abs.startsWith(baseAbs)) throw new Error("Forbidden");
  return abs;
}
function toUrlPath(rel) {
  return rel.split(path.sep).map(encodeURIComponent).join("/");
}
function categoryFor(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (["png", "jpg", "jpeg", "gif", "bmp", "webp", "heif"].includes(ext)) return "image";
  if (["mp4", "mkv", "mov", "avi", "webm", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "flac", "m4a", "aac", "ogg"].includes(ext)) return "audio";
  if (["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md"].includes(ext)) return "doc";
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(ext)) return "archive";
  return "other";
}

// -------- API: list directory ----------
app.get("/api/list", async (req, res) => {
  try {
    const rel = (req.query.path || "").trim();
    const dir = safeResolve(rel);

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
          const urlPath = relPath.split(path.sep).map(encodeURIComponent).join("/");
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

// -------- File routes (Range-aware) ----------
app.get(/^\/file\/(.+)$/, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || "");
    const abs = safeResolve(rel);
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

app.head(/^\/file\/(.+)$/, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || "");
    const abs = safeResolve(rel);
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
app.get(/^\/download\/(.+)$/, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || "");
    const abs = safeResolve(rel);
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

// Smart thumbnail endpoint
app.get(/^\/thumb\/(.+)$/, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || "");
    const abs = safeResolve(rel);
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
            background: { r: 0, g: 0, b: 0, alpha: 0 }, // transparent when format supports it
          });

        if (fm === "jpeg" && h) {
          // JPEG has no alpha — flatten onto white so pads aren't black
          pipe = pipe.flatten({ background: "#ffffff" });
        } else if (fm === "avif") pipe = pipe.avif({ quality: q, effort: 4 });
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

// add near other imports
import ffmpegStatic from "ffmpeg-static";
import { spawn } from "child_process";

// -------- Video thumbnail endpoint (FFmpeg) ----------
app.get(/^\/vthumb\/(.+)$/, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || "");
    const abs = safeResolve(rel);
    const st = await fsp.stat(abs);
    if (!st.isFile()) return res.sendStatus(404);

    const w = Math.max(1, Math.min(4096, parseInt(req.query.w ?? "360", 10)));
    const h = req.query.h ? Math.max(1, Math.min(4096, parseInt(req.query.h, 10))) : null;
    const fit = String(req.query.fit ?? "contain").toLowerCase();
    const fm = String(req.query.fm ?? "jpeg").toLowerCase(); // "jpeg" | "webp"
    const q = Math.max(1, Math.min(100, parseInt(req.query.q ?? "85", 10)));
    const t = Math.max(0, parseFloat(req.query.t ?? "1.0")); // seek time in seconds

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

// -------- Optional: explicit /video route (same Range logic) ----------
app.get(/^\/video\/(.+)$/, async (req, res) => {
  try {
    const rel = decodeURIComponent(req.params[0] || "");
    const abs = safeResolve(rel);
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

// -------- Serve React build from ./dist ----------
const webRoot = path.join(__dirname, "dist"); // ⬅️  UI build goes here
app.use(express.static(webRoot));

// SPA fallback for "/" and "/browse/..."
app.get(/^(?:\/|\/browse\/.*)$/, (req, res) => {
  res.sendFile(path.join(webRoot, "index.html"));
});

app.listen(PORT, () => {
  console.log(`API + static server on http://0.0.0.0:${PORT}`);
  console.log(`Sharing: ${BASE_DIR}`);
  console.log(`Serving UI from: ${webRoot}`);
  console.log(`Password-only gate enabled. Change it with AUTH_PASS env var.`);
});
