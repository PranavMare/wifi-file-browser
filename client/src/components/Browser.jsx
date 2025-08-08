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
  const [density, setDensity] = useState("comfortable");
  const [q, setQ] = useState("");

  // load & persist prefs
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("browser_prefs") || "{}");
      if (saved.filter) setFilter(saved.filter);
      if (saved.sortKey) setSortKey(saved.sortKey);
      if (saved.density) setDensity(saved.density);
      if (saved.q) setQ(saved.q);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem("browser_prefs", JSON.stringify({ filter, sortKey, density, q }));
  }, [filter, sortKey, density, q]);

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

  const cardHeight = density === "compact" ? 160 : 220;

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
    <div className="p-4 font-sans">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.href}>
            {i ? " / " : ""}
            {i < crumbs.length - 1 ? (
              <Link className="text-blue-600 hover:underline" to={c.href}>
                {c.name}
              </Link>
            ) : (
              <strong>{c.name}</strong>
            )}
          </span>
        ))}
      </nav>

      {/* Toolbar */}
      <div className="-mx-3 mb-3 sticky top-0 z-10 bg-white/95 backdrop-blur px-3 py-2 border-b border-neutral-200 flex flex-wrap items-center gap-3">
        {rel ? (
          <Link to={toFolderRoute(parentRel, "")} className="text-blue-600 hover:underline">
            &larr; Up
          </Link>
        ) : (
          <span className="text-neutral-400">&larr; Up</span>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-700">Filter:</span>
          {["images", "videos", "others"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={["border rounded-full px-3 py-1.5 text-sm", filter === key ? "font-semibold border-neutral-800" : "border-neutral-300"].join(" ")}
            >
              {key[0].toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm min-w-[12rem] outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search files…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search files by name"
          />
          {q && (
            <button onClick={() => setQ("")} aria-label="Clear search" className="border border-neutral-300 rounded-full px-2.5 py-1.5 text-sm">
              ×
            </button>
          )}
        </div>

        <div className="flex-1" />

        <label className="text-sm flex items-center gap-1">
          <span>View:</span>
          <select className="border border-neutral-300 rounded-md px-2 py-1 text-sm" value={density} onChange={(e) => setDensity(e.target.value)}>
            <option value="compact">Compact</option>
            <option value="comfortable">Comfortable</option>
          </select>
        </label>

        <label className="text-sm flex items-center gap-1">
          <span>Sort:</span>
          <select className="border border-neutral-300 rounded-md px-2 py-1 text-sm" value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
            <option value="time-desc">Time ↓ (newest)</option>
            <option value="time-asc">Time ↑ (oldest)</option>
            <option value="size-asc">Size ↑ (smallest)</option>
            <option value="size-desc">Size ↓ (largest)</option>
          </select>
        </label>
      </div>

      {loading && <div className="py-5 text-neutral-600">Loading…</div>}
      {err && !loading && <div className="py-5 text-red-600">Error: {err}</div>}
      {!loading && !err && filteredSorted.length === 0 && (
        <div className="py-6 text-neutral-600">
          No items match <strong>{q ? `"${q}"` : "your filter"}</strong>.
        </div>
      )}

      {/* GRID: phones = 2 cols */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3" role="list">
        {pageItems.map((e, i) => (
          <Card key={e.name + ":" + i} rel={rel} entry={e} onOpenImage={openViewer} onOpenVideo={openVideo} cardHeight={cardHeight} density={density} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {pageItems.length < filteredSorted.length && (
        <div className="flex items-center justify-center gap-3 mt-4 text-neutral-700">
          <button className="border rounded-md px-3 py-1.5" onClick={() => setPage((p) => p + 1)}>
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

function Card({ rel, entry: e, onOpenImage, onOpenVideo, cardHeight = 220, density = "comfortable" }) {
  const hrefFolder = toFolderRoute(rel, e.name);

  // long-press menu
  const [menuOpen, setMenuOpen] = useState(false);
  const pressTimer = useRef(null);
  const startPress = () => {
    pressTimer.current = setTimeout(() => setMenuOpen(true), 450);
  };
  const endPress = () => {
    clearTimeout(pressTimer.current);
  };

  const isImage = useCallback(() => {
    if (e.category === "image") return true;
    const m = /\.[^.]+$/.exec(e.name || "");
    const ext = (m ? m[0].slice(1) : "").toLowerCase();
    return ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].includes(ext);
  }, [e.category, e.name]);
  const isVideo = useCallback(() => {
    if (e.category === "video") return true;
    return /\.(mp4|m4v|mov|webm|mkv|avi)$/i.test(e.name || "");
  }, [e.category, e.name]);

  // Folder card
  if (e.is_dir) {
    return (
      <Link
        to={hrefFolder}
        role="listitem"
        aria-label={`Open folder ${e.name}`}
        className="relative overflow-hidden rounded-xl border border-neutral-200 bg-white h-56 flex items-stretch justify-center"
      >
        <div className="w-full h-full flex items-center justify-center text-[54px] text-amber-600 bg-neutral-100">📁</div>
        <div className="absolute inset-x-0 bottom-0 p-2 text-white flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/60 to-transparent">
          <div className="font-semibold text-xs truncate flex-1" title={e.name}>
            {e.name}/
          </div>
        </div>
      </Link>
    );
  }

  const canFullscreen = isImage();
  const fileHref = e.file;

  // Images → responsive thumbnails
  if (canFullscreen) {
    const thumbBase = (e.thumb || "").split("?")[0] || (fileHref ? fileHref.replace(/^\/file\//, "/thumb/") : "");
    const widths = [240, 360, 480, 720];
    const sizes = "(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 200px";
    const ghostBtn = "text-white/95 bg-white/20 border border-white/30 rounded-md px-2.5 py-1 text-xs backdrop-blur hover:bg-white/25";
    const kebabBtn = `${ghostBtn} px-2 py-1 text-sm`;

    return (
      <div
        role="listitem"
        className={`relative overflow-hidden rounded-xl border border-neutral-200 bg-white ${
          density === "compact" ? "h-40" : "h-56"
        } flex items-stretch justify-center touch-manipulation`}
        onClick={() => onOpenImage?.(fileHref)}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        aria-label={`Open ${e.name} fullscreen`}
        tabIndex={0}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpenImage?.(fileHref);
          }
        }}
      >
        <picture
          onClick={(ev) => {
            ev.stopPropagation();
            onOpenImage?.(fileHref);
          }}
          className="w-full h-full"
        >
          <source type="image/avif" srcSet={widths.map((w) => `${thumbBase}?w=${w}&h=${cardHeight}&fit=cover&fm=avif&q=60 ${w}w`).join(", ")} sizes={sizes} />
          <source type="image/webp" srcSet={widths.map((w) => `${thumbBase}?w=${w}&h=${cardHeight}&fit=cover&fm=webp&q=82 ${w}w`).join(", ")} sizes={sizes} />
          <img
            loading="lazy"
            decoding="async"
            src={`${thumbBase}?w=360&h=${cardHeight}&fit=cover&fm=jpeg&q=85`}
            alt={e.name || ""}
            className="w-full h-full object-cover bg-neutral-100 cursor-zoom-in select-none"
            draggable={false}
            onError={(ev) => {
              ev.currentTarget.src = fileHref;
            }}
          />
        </picture>

        <FooterOverlay name={e.name} fileHref={fileHref} downloadHref={e.download} menuOpen={menuOpen} setMenuOpen={setMenuOpen} />
      </div>
    );
  }

  // Videos → play in lightbox
  if (isVideo()) {
    const fileHref = e.file;
    const vthumbBase = fileHref.replace(/^\/file\//, "/vthumb/"); // same relative path
    const widths = [240, 360, 480, 720];
    const sizes = "(max-width: 640px) 44vw, (max-width: 1024px) 22vw, 200px";
    const ghostBtn = "text-white/95 bg-white/20 border border-white/30 rounded-md px-2.5 py-1 text-xs backdrop-blur hover:bg-white/25";

    return (
      <div
        role="listitem"
        className={`relative overflow-hidden rounded-xl border border-neutral-200 bg-black ${density === "compact" ? "h-40" : "h-56"}`}
        onClick={() => onOpenVideo?.(fileHref)}
        onTouchStart={startPress}
        onTouchEnd={endPress}
        onTouchCancel={endPress}
        aria-label={`Play ${e.name}`}
        tabIndex={0}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            onOpenVideo?.(fileHref);
          }
        }}
      >
        {/* Poster */}
        <picture onClick={(ev) => ev.stopPropagation()} className="w-full h-full block">
          <source
            type="image/webp"
            srcSet={widths.map((w) => `${vthumbBase}?w=${w}&h=${density === "compact" ? 160 : 220}&fit=cover&fm=webp&q=82 ${w}w`).join(", ")}
            sizes={sizes}
          />
          <img
            loading="lazy"
            decoding="async"
            src={`${vthumbBase}?w=360&h=${density === "compact" ? 160 : 220}&fit=cover&fm=jpeg&q=85`}
            alt={e.name || ""}
            className="w-full h-full object-cover bg-neutral-900"
            onError={(ev) => {
              ev.currentTarget.style.display = "none";
            }}
          />
        </picture>

        {/* Play overlay */}
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur border border-white/30 grid place-items-center">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>

        {/* Footer */}
        <div
          className="absolute inset-x-0 bottom-0 p-2 text-white flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/60 to-transparent"
          onClick={(e2) => e2.stopPropagation()}
        >
          <div className="font-semibold text-xs truncate flex-1" title={e.name}>
            {e.name}
          </div>
          <button className={ghostBtn} onClick={() => onOpenVideo?.(fileHref)}>
            Play
          </button>
          <a className={ghostBtn} href={e.download}>
            Download
          </a>
        </div>
      </div>
    );
  }

  // Other files
  return (
    <div
      role="listitem"
      className={`relative overflow-hidden rounded-xl border border-neutral-200 bg-white ${
        density === "compact" ? "h-40" : "h-56"
      } flex items-stretch justify-center`}
      tabIndex={-1}
      aria-label={e.name}
      onTouchStart={startPress}
      onTouchEnd={endPress}
      onTouchCancel={endPress}
    >
      <div className="w-full h-full flex items-center justify-center text-4xl bg-neutral-100" aria-label={e.category} title={e.category}>
        {iconFor(e.category)}
      </div>
      <div className="absolute inset-x-0 bottom-0 p-2 text-white flex items-center gap-2 bg-gradient-to-t from-black/70 via-black/60 to-transparent">
        <div className="font-semibold text-xs truncate flex-1" title={e.name}>
          {e.name}
        </div>
        <a className="text-white/95 bg-white/20 border border-white/30 rounded-md px-2.5 py-1 text-xs backdrop-blur hover:bg-white/25" href={e.download}>
          Download
        </a>
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
          <button className="px-3 py-2 text-left text-sm text-white hover:bg-white/5 border-b border-white/10" onClick={() => window.open(fileHref, "_blank")}>
            Open
          </button>
          <a className="px-3 py-2 text-left text-sm text-white hover:bg-white/5 border-b border-white/10" href={downloadHref}>
            Download
          </a>
          <button
            className="px-3 py-2 text-left text-sm text-white hover:bg-white/5"
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
          <button className="px-3 py-2 text-left text-sm text-white hover:bg-white/5" onClick={() => setMenuOpen(false)}>
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
