// src/components/FileCard.jsx
import React from "react";
import { Link } from "react-router-dom";
import { toFolderRoute } from "../utils/paths";

export default function FileCard({ rel, entry: e, onOpenImage, onOpenVideo, onOpenDoc }) {
  const hrefFolder = toFolderRoute(rel, e.name);
  const baseTile = "relative aspect-square overflow-hidden rounded-md bg-neutral-100 dark:bg-[#102436] text-neutral-900 dark:text-white select-none";

  const isImage = React.useCallback(() => e.category === "image" || /\.(jpg|jpeg|png|webp|gif|bmp|svg|heic|heif)$/i.test(e.name || ""), [e.category, e.name]);
  const isVideo = React.useCallback(() => e.category === "video" || /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(e.name || ""), [e.category, e.name]);
  const isDoc = React.useCallback(() => e.category === "doc" || /\.(pdf|txt|md|csv|json|log)$/i.test(e.name || ""), [e.category, e.name]);

  if (e.is_dir) {
    return (
      <Link to={hrefFolder} role="listitem" aria-label={`Open folder ${e.name}`} className={`${baseTile} flex items-center justify-center`}>
        <div className="text-5xl sm:text-6xl text-amber-600 ">📁</div>
        <div className="absolute inset-x-0 bottom-0 text-white text-xs sm:text-[13px] px-2 py-1 bg-black/55 backdrop-blur-sm">
          <div className="truncate" title={e.name}>
            {e.name}
          </div>
        </div>
      </Link>
    );
  }

  const fileHref = e.file;

  // ---------- IMAGE ----------
  if (isImage()) {
    const imgWidths = [180, 240, 320, 480];
    const sizes = "(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 180px";

    // Normalize to absolute /thumb/... (avoid /browse//thumb and drive letters)
    const thumbBase = React.useMemo(() => {
      let t = e.thumb || (e.file ? e.file.replace(/^\/file\//, "/thumb/") : "");
      t = t.replace(/^\/browse\/+/, "/");
      t = t.replace(/^\/{2,}/, "/");
      if (!t.startsWith("/")) t = `/${t}`;
      try {
        const u = new URL(t, window.location.origin);
        return u.pathname; // "/thumb/214/IMG_123.heic"
      } catch {
        return t;
      }
    }, [e.thumb, e.file]);

    // If a thumb fails, switch to a tiny data-URI and stop retrying
    const [thumbBroken, setThumbBroken] = React.useState(false);
    const PLACEHOLDER_1x1 = "data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA="; // universal 1x1 transparent

    return (
      <button type="button" onClick={() => onOpenImage?.(fileHref)} aria-label={`Open ${e.name} fullscreen`} className={`${baseTile}`}>
        {thumbBroken ? (
          // Simple placeholder tile (no <picture> to avoid re-selection)
          <img src={PLACEHOLDER_1x1} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />
        ) : (
          <picture>
            <source type="image/avif" srcSet={imgWidths.map((w) => `${thumbBase}?w=${w}&h=${w}&fit=cover&fm=avif&q=65 ${w}w`).join(", ")} sizes={sizes} />
            <source type="image/webp" srcSet={imgWidths.map((w) => `${thumbBase}?w=${w}&h=${w}&fit=cover&fm=webp&q=82 ${w}w`).join(", ")} sizes={sizes} />
            <img
              loading="lazy"
              decoding="async"
              src={`${thumbBase}?w=240&h=240&fit=cover&fm=jpeg&q=85`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              draggable={false}
              onError={(ev) => {
                // prevent infinite loop (never fall back to /file/... for HEIC)
                ev.currentTarget.onerror = null;
                setThumbBroken(true);
                // immediate visual fallback until React re-renders
                ev.currentTarget.src = PLACEHOLDER_1x1;
              }}
            />
          </picture>
        )}
      </button>
    );
  }

  // ---------- VIDEO ----------
  if (isVideo()) {
    const vthumbBase = fileHref.replace(/^\/file\//, "/vthumb/");
    const vImgWidths = [180, 240, 320, 480];
    const vSizes = "(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 180px";
    const [previewing, setPreviewing] = React.useState(false);
    const videoRef = React.useRef(null);

    const startInlinePlay = (ev) => {
      ev.stopPropagation();
      setPreviewing(true);
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (v) {
          try {
            v.currentTime = 0;
            v.play().catch(() => {});
          } catch {}
        }
      });
    };

    return (
      <div
        role="listitem"
        className="relative aspect-square overflow-hidden rounded-md bg-black select-none"
        onClick={() => onOpenVideo?.(fileHref)}
        tabIndex={0}
        aria-label={`Play ${e.name}`}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpenVideo?.(fileHref);
          }
        }}
      >
        {previewing ? (
          <video
            ref={videoRef}
            src={fileHref}
            className="absolute inset-0 w-full h-full object-cover"
            autoPlay
            muted
            playsInline
            onEnded={() => setPreviewing(false)}
            onError={() => setPreviewing(false)}
          />
        ) : (
          <picture className="absolute inset-0 w-full h-full block">
            <source
              type="image/webp"
              srcSet={vImgWidths.map((w) => `${vthumbBase}?w=${w}&h=${w}&fit=cover&fm=webp&q=82&t=1 ${w}w`).join(", ")}
              sizes={vSizes}
            />
            <img
              loading="lazy"
              decoding="async"
              src={`${vthumbBase}?w=240&h=240&fit=cover&fm=jpeg&q=85&t=1`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              onError={(ev) => {
                // if video thumb fails, just hide the image; clicking still opens the player
                ev.currentTarget.onerror = null;
                ev.currentTarget.style.display = "none";
              }}
            />
          </picture>
        )}

        {!previewing && (
          <button
            type="button"
            onClick={startInlinePlay}
            aria-label="Play"
            className="absolute bottom-1 right-1 w-5 h-5 sm:w-6 sm:h-6 grid place-items-center
                     rounded-full bg-white/25 border border-white/40 backdrop-blur
                     hover:bg-white/30 active:scale-95 transition pointer-events-auto"
          >
            <svg viewBox="0 0 24 24" className="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="white" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  // ---------- DOC ----------
  if (isDoc()) {
    return (
      <button type="button" onClick={() => onOpenDoc?.(e.file, e.name)} aria-label={`Open ${e.name}`} className={`${baseTile} grid place-items-center`}>
        <div className="text-3xl" aria-hidden="true">
          📄
        </div>
        <div className="absolute bottom-1 left-1 right-1 text-[11px] truncate text-white/90">{e.name}</div>
      </button>
    );
  }

  // ---------- OTHER ----------
  return (
    <div role="listitem" aria-label={e.name} className={`${baseTile} grid place-items-center`}>
      <div className="text-3xl" aria-hidden="true">
        {iconFor(e.category)}
      </div>
    </div>
  );
}

function iconFor(cat) {
  if (cat === "video") return "🎞️";
  if (cat === "audio") return "🎧";
  if (cat === "doc") return "📄";
  if (cat === "archive") return "🗜️";
  return "📦";
}
