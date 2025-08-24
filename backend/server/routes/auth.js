// server/routes/auth.js
import { Router } from "express";
import crypto from "crypto";

export default function authRoutes({ PASSWORD, COOKIE_NAME }) {
  const r = Router();

  r.get("/login", (req, res) => {
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

  r.post("/login", (req, res) => {
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

  r.get("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME);
    res.redirect(302, "/login");
  });

  return r;
}
