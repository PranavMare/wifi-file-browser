import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import FullscreenViewer from "./FullscreenViewer";
import VideoLightbox from "./VideoLightbox";
import { listDir } from "../lib/api";

const PAGE_SIZE = 120;

function useRelPath() {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/browse\/(.*)$/);
  return m ? decodeURIComponent(m[1]) : "";
}
function joinSegments(...parts) {
  const segs = [];
  for (const p of parts) {
    if (!p) continue;
    for (const s of String(p).split("/")) {
      if (s) segs.push(encodeURIComponent(s));
    }
  }
  return segs.join("/");
}
function toFolderRoute(rel, child) {
  const joined = joinSegments(rel, child);
  return joined ? `/browse/${joined}` : "/browse";
}

const FILTERS = {
  images: new Set(["image"]),
  videos: new Set(["video"]),
  others: new Set(["audio", "doc", "archive", "other"]),
};

export default function Browser() {
  const rel = useRelPath();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  const [filter, setFilter] = useState("images");
  const [sortKey, setSortKey] = useState("time-desc");
  const [q, setQ] = useState("");

  // load & persist prefs
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("browser_prefs") || "{}");
      if (saved.filter) setFilter(saved.filter);
      if (saved.sortKey) setSortKey(saved.sortKey);

      if (saved.q) setQ(saved.q);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem("browser_prefs", JSON.stringify({ filter, sortKey, q }));
  }, [filter, sortKey, q]);

  // fetch current folder
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const data = await listDir(rel);
        if (alive) {
          setItems(data);
          setPage(1);
        }
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [rel]);

  useEffect(() => setPage(1), [filter, sortKey, q]);

  const parentRel = useMemo(() => {
    const segs = rel.split("/").filter(Boolean);
    segs.pop();
    return segs.join("/");
  }, [rel]);

  const filteredSorted = useMemo(() => {
    let arr = items.filter((e) => e.is_dir || FILTERS[filter].has(e.category));
    if (q.trim()) {
      const term = q.toLowerCase();
      arr = arr.filter((e) => e.name.toLowerCase().includes(term));
    }
    const [field, order] = sortKey.split("-");
    const rev = order === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let av = 0,
        bv = 0;
      if (field === "time") {
        av = a.mtime_ts || 0;
        bv = b.mtime_ts || 0;
      } else if (field === "size") {
        av = a.size || 0;
        bv = b.size || 0;
      }
      if (av === bv) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return rev * (av - bv);
    });
    return arr;
  }, [items, filter, sortKey, q]);

  // infinite scroll sentinel
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const en = entries[0];
        if (en.isIntersecting) {
          setPage((p) => (p * PAGE_SIZE < filteredSorted.length ? p + 1 : p));
        }
      },
      { rootMargin: "1200px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filteredSorted.length]);

  const pageItems = filteredSorted.slice(0, page * PAGE_SIZE);

  // IMAGES (for FullscreenViewer)
  const images = useMemo(
    () => filteredSorted.filter((e) => !e.is_dir && e.category === "image").map((e) => ({ src: e.file, name: e.name, download: e.download })),
    [filteredSorted]
  );
  const indexBySrc = useMemo(() => {
    const m = new Map();
    images.forEach((it, i) => m.set(it.src, i));
    return m;
  }, [images]);
  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const openViewer = useCallback(
    (fileHref) => {
      const idx = indexBySrc.get(fileHref);
      if (idx != null) setViewer({ open: true, index: idx });
    },
    [indexBySrc]
  );
  const setIndexWrapped = useCallback((i) => setViewer((v) => ({ ...v, index: ((i % images.length) + images.length) % images.length })), [images.length]);

  // VIDEOS (for VideoLightbox)
  const videos = useMemo(
    () => filteredSorted.filter((e) => !e.is_dir && e.category === "video").map((e) => ({ src: e.file, name: e.name, download: e.download })),
    [filteredSorted]
  );
  const videoIndexBySrc = useMemo(() => {
    const m = new Map();
    videos.forEach((it, i) => m.set(it.src, i));
    return m;
  }, [videos]);
  const [videoViewer, setVideoViewer] = useState({ open: false, index: 0 });
  const openVideo = useCallback(
    (fileHref) => {
      const idx = videoIndexBySrc.get(fileHref);
      if (idx != null) setVideoViewer({ open: true, index: idx });
    },
    [videoIndexBySrc]
  );
  const setVideoIndexWrapped = useCallback(
    (i) => setVideoViewer((v) => ({ ...v, index: ((i % videos.length) + videos.length) % videos.length })),
    [videos.length]
  );

  // breadcrumbs
  const crumbs = useMemo(() => {
    const segs = rel.split("/").filter(Boolean);
    const out = [{ name: "root", href: "/browse" }];
    let acc = "";
    segs.forEach((s) => {
      acc = acc ? `${acc}/${s}` : s;
      out.push({ name: s, href: `/browse/${acc.split("/").map(encodeURIComponent).join("/")}` });
    });
    return out;
  }, [rel]);

  return (
    <div className="min-h-screen p-4 font-sans bg-white text-neutral-900 dark:bg-[#232939ff] dark:text-white">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.href}>
            {i ? " / " : ""}
            {i < crumbs.length - 1 ? (
              <Link className="text-blue-600 hover:underline dark:text-blue-300" to={c.href}>
                {c.name}
              </Link>
            ) : (
              <strong>{c.name}</strong>
            )}
          </span>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="-mx-3 mb-3 sticky top-0 z-10 px-3 py-2 border-b bg-white/80 border-neutral-200 backdrop-blur dark:bg-white/10 dark:border-white/15">
        <div className="flex flex-wrap items-center gap-3">
          {rel ? (
            <Link to={toFolderRoute(parentRel, "")} className="text-blue-600 hover:underline dark:text-blue-300">
              &larr; Up
            </Link>
          ) : (
            <span className="text-neutral-400 dark:text-white/60">&larr; Up</span>
          )}
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-700 dark:text-white/80">Filter:</span>
            {["images", "videos", "others"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={`rounded-full px-3 py-1.5 text-sm border transition
                ${filter === key ? "font-semibold border-neutral-800 dark:border-white" : "border-neutral-300 dark:border-white/20"}`}
              >
                {key[0].toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm min-w-[12rem] outline-none
                         focus:ring-2 focus:ring-blue-500
                         dark:bg-white/10 dark:text-white dark:border-white/20
                         placeholder:text-neutral-400 dark:placeholder:text-white/60"
              placeholder="Search files…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search files by name"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                aria-label="Clear search"
                className="border border-neutral-300 rounded-full px-2.5 py-1.5 text-sm dark:border-white/25"
              >
                ×
              </button>
            )}
          </div>
          <div className="flex-1" />
          <label className="text-sm flex items-center gap-1"></label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-700 dark:text-white/80">Sort:</span>
            {[
              ["time-desc", "Newest"],
              ["time-asc", "Oldest"],
              ["size-desc", "Largest"],
              ["size-asc", "Smallest"],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                aria-pressed={sortKey === key}
                className={`rounded-full px-3 py-1.5 text-sm border transition ${
                  sortKey === key ? "font-semibold border-neutral-600 dark:border-white" : "border-neutral-300 dark:border-white/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="py-5 text-neutral-600 dark:text-white/80">Loading…</div>}
      {err && !loading && <div className="py-5 text-red-600 dark:text-red-300">Error: {err}</div>}
      {!loading && !err && filteredSorted.length === 0 && <div className="py-6 text-neutral-600 dark:text:white/70"></div>}

      {/* GRID: phones = 3 cols */}
      <div className={`grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 gap-1`} role="list">
        {pageItems.map((e, i) => (
          <Card key={e.name + ":" + i} rel={rel} entry={e} onOpenImage={openViewer} onOpenVideo={openVideo} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {pageItems.length < filteredSorted.length && (
        <div className="flex items-center justify-center gap-3 mt-4 text-neutral-700 dark:text-white/80">
          <button
            className="border rounded-md px-3 py-1.5 border-neutral-300 dark:border-white/25"
            onClick={() => setPage((p) => Math.min(p + 1, Math.ceil(filteredSorted.length / PAGE_SIZE)))}
          >
            Load more
          </button>
          <span>
            Showing {pageItems.length} of {filteredSorted.length}
          </span>
        </div>
      )}

      {/* Image viewer */}
      <FullscreenViewer
        open={viewer.open}
        items={images}
        index={viewer.index}
        setIndex={setIndexWrapped}
        onClose={() => setViewer((v) => ({ ...v, open: false }))}
      />

      {/* Video lightbox */}
      <VideoLightbox
        open={videoViewer.open}
        items={videos}
        index={videoViewer.index}
        setIndex={setVideoIndexWrapped}
        onClose={() => setVideoViewer((v) => ({ ...v, open: false }))}
      />
    </div>
  );
}

function Card({ rel, entry: e, onOpenImage, onOpenVideo }) {
  const hrefFolder = toFolderRoute(rel, e.name);

  const isImage = React.useCallback(() => {
    if (e.category === "image") return true;
    const m = /\.[^.]+$/.exec(e.name || "");
    const ext = (m ? m[0].slice(1) : "").toLowerCase();
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg", "heic", "heif"].includes(ext);
  }, [e.category, e.name]);

  const isVideo = React.useCallback(() => {
    if (e.category === "video") return true;
    return /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(e.name || "");
  }, [e.category, e.name]);

  const baseTile = "relative aspect-square overflow-hidden rounded-md bg-neutral-100 dark:bg-[#102436] text-neutral-900 dark:text-white select-none";

  // ---------- FOLDER ----------
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

  // helpers for responsive, square thumbnails
  const imgWidths = [180, 240, 320, 480];
  const sizes = "(max-width: 640px) 33vw, (max-width: 1024px) 20vw, 180px";

  // ---------- IMAGE ----------
  if (isImage()) {
    const thumbBase = (e.thumb || "").split("?")[0] || (fileHref ? fileHref.replace(/^\/file\//, "/thumb/") : "");

    return (
      <button type="button" onClick={() => onOpenImage?.(fileHref)} aria-label={`Open ${e.name} fullscreen`} className={`${baseTile}`}>
        <picture>
          <source type="image/avif" srcSet={imgWidths.map((w) => `${thumbBase}?w=${w}&h=${w}&fit=cover&fm=avif&q=65 ${w}w`).join(", ")} sizes={sizes} />
          <source type="image/webp" srcSet={imgWidths.map((w) => `${thumbBase}?w=${w}&h=${w}&fit=cover&fm=webp&q=82 ${w}w`).join(", ")} sizes={sizes} />
          <img
            loading="lazy"
            decoding="async"
            src={`${thumbBase}?w=240&h=240&fit=cover&fm=jpeg&q=85`}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
            onError={(ev) => {
              ev.currentTarget.src = fileHref;
            }}
          />
        </picture>
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

  // ---------- OTHER ----------
  return (
    <div role="listitem" aria-label={e.name} className={`${baseTile} grid place-items-center`}>
      <div className="text-3xl" aria-hidden="true">
        {iconFor(e.category)}
      </div>
    </div>
  );
}

function FooterOverlay({ name, fileHref, downloadHref, menuOpen, setMenuOpen }) {
  const ghostBtn = "text-white/95 bg-white/20 border border-white/30 rounded-md px-2.5 py-1 text-xs backdrop-blur hover:bg-white/25";
  const kebabBtn = `${ghostBtn} px-2 py-1 text-sm`;

  return (
    <>
      <div
        className="absolute inset-x-0 bottom-0 p-2 text-white flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/60 to-transparent"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="font-semibold text-xs truncate flex-1" title={name}>
          {name}
        </div>
        <div className="flex items-center gap-2">
          <a className={ghostBtn} href={fileHref} target="_blank" rel="noreferrer">
            Open
          </a>
          <a className={ghostBtn} href={downloadHref}>
            Download
          </a>
          <button className={kebabBtn} aria-haspopup="menu" aria-expanded={menuOpen ? "true" : "false"} onClick={() => setMenuOpen((v) => !v)} title="More">
            ⋮
          </button>
        </div>
      </div>

      {menuOpen && (
        <div
          className="absolute right-2 bottom-12 min-w-[160px] flex flex-col rounded-xl overflow-hidden border border-white/20 bg-black/80 z-10"
          onClick={(e2) => e2.stopPropagation()}
        >
          <button className="px-3 py-2 text-left text-sm text-white hover:bg:white/5 border-b border-white/10" onClick={() => window.open(fileHref, "_blank")}>
            Open
          </button>
          <a className="px-3 py-2 text-left text-sm text-white hover:bg:white/5 border-b border-white/10" href={downloadHref}>
            Download
          </a>
          <button
            className="px-3 py-2 text-left text-sm text-white hover:bg:white/5"
            onClick={async () => {
              const url = new URL(fileHref, location.origin).toString();
              try {
                if (navigator.share) await navigator.share({ title: name, url });
                else {
                  await navigator.clipboard.writeText(url);
                  alert("Link copied!");
                }
              } catch {}
              setMenuOpen(false);
            }}
          >
            Share / Copy link
          </button>
          <button className="px-3 py-2 text-left text-sm text-white hover:bg:white/5" onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}

function iconFor(cat) {
  if (cat === "video") return "🎞️";
  if (cat === "audio") return "🎧";
  if (cat === "doc") return "📄";
  if (cat === "archive") return "🗜️";
  return "📦";
}
