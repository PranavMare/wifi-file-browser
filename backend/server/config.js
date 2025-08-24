// server/config.js
import "dotenv/config";
import path from "path";

const BASE_DIR = process.env.BASE_DIR || path.resolve(process.cwd());

export const CONFIG = {
  PASSWORD: String(process.env.AUTH_PASS || ""),
  COOKIE_SECRET: String(process.env.COOKIE_SECRET || ""),
  COOKIE_NAME: process.env.COOKIE_NAME || "wf_auth",
  BASE_DIR,
  PORT: Number(process.env.PORT || 3000),
  CACHE_DIR: path.resolve(".cache/thumbs"),
  VTHUMB_DIR: path.resolve(".cache/vthumbs"),
};

if (!CONFIG.PASSWORD) console.warn("⚠️  AUTH_PASS not set — login will always fail.");
if (!CONFIG.COOKIE_SECRET) console.warn("⚠️  COOKIE_SECRET not set — signing cookies is insecure.");
if (!process.env.BASE_DIR) console.warn(`ℹ️  BASE_DIR not set — defaulting to ${CONFIG.BASE_DIR}`);
