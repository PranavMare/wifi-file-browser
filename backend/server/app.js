// server/app.js
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";

import { CONFIG } from "./config.js";
import { passwordGate } from "./middleware/passwordGate.js";

import authRoutes from "./routes/auth.js";
import listRoutes from "./routes/list.js";
import filesRoutes from "./routes/files.js";
import thumbRoutes from "./routes/thumb.js";
import vthumbRoutes from "./routes/vthumb.js";
import videoRoutes from "./routes/video.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  // 1) Parsers (must be before the gate)
  app.use(cookieParser(CONFIG.COOKIE_SECRET));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.json());
  app.use(cors());

  // 2) Auth + gate
  app.use(authRoutes({ PASSWORD: CONFIG.PASSWORD, COOKIE_NAME: CONFIG.COOKIE_NAME }));
  app.use(passwordGate({ cookieName: CONFIG.COOKIE_NAME }));

  // 3) API/asset routes
  app.use(listRoutes({ BASE_DIR: CONFIG.BASE_DIR }));
  app.use(filesRoutes({ BASE_DIR: CONFIG.BASE_DIR }));
  app.use(thumbRoutes({ BASE_DIR: CONFIG.BASE_DIR, CACHE_DIR: CONFIG.CACHE_DIR }));
  app.use(vthumbRoutes({ BASE_DIR: CONFIG.BASE_DIR, VTHUMB_DIR: CONFIG.VTHUMB_DIR }));
  app.use(videoRoutes({ BASE_DIR: CONFIG.BASE_DIR }));

  return app;
}
