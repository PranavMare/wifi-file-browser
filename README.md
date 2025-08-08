# WiFi Files (React + Node)

A fast, mobile-friendly file browser you open from your phone over local Wi-Fi. Browse folders, view images (fullscreen with gestures), stream videos (HTTP Range), download, search, and filter—served by a single Node/Express server.

---

## Quick Start

```bash
# 1) install server deps (root)
npm install

# 2) install client deps
cd client
npm install

# 3) build the client into ../dist
npm run build
cd ..

# 4) run the server (serves dist + APIs)
node server.js
# open http://localhost:3000
```

---

## Env Vars (optional)

Create a `.env` or set in your shell:

```bash
AUTH_PASS=8080                 # login password
COOKIE_SECRET=please-change-me # cookie signing secret
BASE_DIR=C:\Users\Pranav\Downloads  # folder to share
PORT=3000
```

---

## Features

- Breadcrumbs, infinite scroll, **filters** (Images / Videos / Others), **search**, **sort**.
- **Images**: high-quality thumbs, fullscreen lightbox (pinch, double-tap zoom, swipe nav, rotate).
- **Videos**: in-browser playback via Range (`/file/*`), optional poster thumbnails (`/vthumb/*`).
- Quick actions: Open / Download / Share; long-press menu on mobile.
- Simple password gate before anything loads.

---

## Build Output

Ensure the client builds to `../dist` so the server can serve it:

**client/vite.config.js**

```js
export default {
  // ...
  build: { outDir: "../dist", emptyOutDir: true },
};
```

---

## Useful Routes

- `GET /api/list?path=<rel>` → directory listing under `BASE_DIR`
- `GET /file/<path>` → streams file (supports `Range`)
- `GET /download/<path>` → download file
- `GET /thumb/<path>?w=360&h=220&fit=cover&fm=webp&q=82` → image thumbnail (sharp)
- `GET /vthumb/<path>?w=360&h=220&fit=cover&fm=jpeg&q=85&t=1.5` → video poster (FFmpeg)

> For video posters, install FFmpeg (system) or:
>
> ```bash
> npm i ffmpeg-static
> ```

---

## Scripts (suggested)

**package.json (root)**

```json
{
  "scripts": {
    "start": "node server.js",
    "dev:server": "node server.js",
    "build": "npm run build:client",
    "build:client": "cd client && vite build",
    "dev:client": "cd client && vite"
  }
}
```

**client/package.json**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview --host"
  }
}
```

---

## Notes

- Designed for **trusted local networks** (single password). Change `AUTH_PASS` and `COOKIE_SECRET`.
- If thumbnails don’t show:

  - Install **sharp** (comes via `npm install`).
  - For video posters, install **FFmpeg** or `ffmpeg-static`.
