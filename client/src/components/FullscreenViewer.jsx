import { useEffect, useRef, useState, useCallback } from "react";

export default function FullscreenViewer({ open, items, index, setIndex, onClose }) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const safeIndex = hasItems ? ((index % items.length) + items.length) % items.length : 0;
  const item = hasItems ? items[safeIndex] : null;

  const containerRef = useRef(null);
  const imgRef = useRef(null);

  const naturalRef = useRef({ w: 0, h: 0 });
  const viewRef = useRef({ mode: "fit", zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 });
  const [ui, setUi] = useState({ mode: "fit", zoom: 1, rotation: 0, playing: false });
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(null);
  const dragRef = useRef(null);
  const lastTapRef = useRef({ t: 0, x: 0, y: 0 });
  const playingRef = useRef(false);

  const ZOOM_MIN = 0.1,
    ZOOM_MAX = 8,
    SLIDESHOW_MS = 2000;

  const forceUi = () => {
    const v = viewRef.current;
    setUi((u) => ({ ...u, mode: v.mode, zoom: v.zoom, rotation: v.rotation, playing: playingRef.current }));
  };

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setIndex(safeIndex + 1);
      else if (e.key === "ArrowLeft") setIndex(safeIndex - 1);
      else if (e.key === "+" || e.key === "=") zoomBy(1.2);
      else if (e.key === "-" || e.key === "_") zoomBy(1 / 1.2);
      else if (e.key === "0") resetView();
      else if (e.key.toLowerCase() === "r") rotateBy(90);
      else if (e.key.toLowerCase() === "f") toggleFit();
      else if (e.code === "Space") {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, safeIndex, setIndex, onClose]);

  useEffect(() => {
    if (!open) return;
    playingRef.current = false;
    let id;
    const tick = () => {
      if (playingRef.current && hasItems) setIndex(safeIndex + 1);
      id = setTimeout(tick, SLIDESHOW_MS);
    };
    id = setTimeout(tick, SLIDESHOW_MS);
    return () => clearTimeout(id);
  }, [open, hasItems, setIndex, safeIndex]);

  useEffect(() => {
    if (!open || !hasItems) return;
    const n = new Image();
    n.src = items[(safeIndex + 1) % items.length]?.src || "";
    const p = new Image();
    p.src = items[(safeIndex - 1 + items.length) % items.length]?.src || "";
  }, [open, hasItems, items, safeIndex]);

  useEffect(() => {
    if (!open) return;
    viewRef.current = { mode: "fit", zoom: 1, offsetX: 0, offsetY: 0, rotation: 0 };
    forceUi();
    renderNow();
  }, [open, safeIndex]);

  const computeFitZoom = useCallback(() => {
    const c = containerRef.current;
    const { w, h } = naturalRef.current;
    if (!c || !w || !h) return 1;
    return Math.min(c.clientWidth / w, c.clientHeight / h) || 1;
  }, []);

  const applyMode = (mode) => {
    const v = viewRef.current;
    v.mode = mode;
    if (mode === "fit") {
      v.zoom = computeFitZoom();
      v.offsetX = 0;
      v.offsetY = 0;
    } else {
      v.zoom = 1;
    }
    renderNow();
    forceUi();
  };

  const toggleFit = () => applyMode(viewRef.current.mode === "fit" ? "actual" : "fit");
  const resetView = () => {
    viewRef.current.rotation = 0;
    applyMode("fit");
  };
  const rotateBy = (deg) => {
    const v = viewRef.current;
    v.rotation = (Math.round((v.rotation + deg) / 90) * 90 + 360) % 360;
    renderNow();
    forceUi();
  };

  const zoomBy = (factor, aroundPoint) => {
    const v = viewRef.current;
    const zPrev = v.zoom;
    const zNew = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, zPrev * factor));
    if (aroundPoint && containerRef.current) {
      const ratio = zNew / zPrev;
      v.offsetX = v.offsetX * ratio + aroundPoint.x * (1 - ratio);
      v.offsetY = v.offsetY * ratio + aroundPoint.y * (1 - ratio);
    }
    v.zoom = zNew;
    v.mode = "actual";
    renderNow();
    forceUi();
  };

  const pointFromEvent = (e) => {
    const rect = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

  const onPointerDown = (e) => {
    if (!open) return;
    const pt = pointFromEvent(e);
    containerRef.current.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, pt);

    if (e.pointerType === "touch") {
      const now = Date.now(),
        last = lastTapRef.current;
      const dt = now - last.t,
        d = Math.hypot(pt.x - last.x, pt.y - last.y);
      if (dt < 250 && d < 30) {
        const base = viewRef.current.mode === "fit" ? computeFitZoom() : 1;
        const target = viewRef.current.zoom < base * 1.8 ? 2.0 : base;
        zoomBy(target / viewRef.current.zoom, pt);
        lastTapRef.current = { t: 0, x: 0, y: 0 };
        return;
      }
      lastTapRef.current = { t: now, x: pt.x, y: pt.y };
    }

    if (pointersRef.current.size === 1) {
      const v = viewRef.current;
      dragRef.current = { startX: pt.x, startY: pt.y, startOffsetX: v.offsetX, startOffsetY: v.offsetY };
    } else if (pointersRef.current.size === 2) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      pinchRef.current = { dist: distance(p1, p2), zoom: viewRef.current.zoom };
    }
  };

  const onPointerMove = (e) => {
    if (!open) return;
    if (!pointersRef.current.has(e.pointerId)) return;
    const pt = pointFromEvent(e);
    pointersRef.current.set(e.pointerId, pt);

    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [p1, p2] = Array.from(pointersRef.current.values());
      const distNow = distance(p1, p2);
      const center = midpoint(p1, p2);
      const f = distNow / Math.max(1, pinchRef.current.dist);
      const target = Math.max(0.1, Math.min(8, pinchRef.current.zoom * f));
      const ratio = target / viewRef.current.zoom;
      viewRef.current.offsetX = viewRef.current.offsetX * ratio + center.x * (1 - ratio);
      viewRef.current.offsetY = viewRef.current.offsetY * ratio + center.y * (1 - ratio);
      viewRef.current.zoom = target;
      viewRef.current.mode = "actual";
      renderNow();
      return;
    }

    if (pointersRef.current.size === 1 && dragRef.current) {
      const v = viewRef.current;
      const base = v.mode === "fit" ? computeFitZoom() : 1;
      const allowPan = v.zoom > base * 1.01;
      const dx = pt.x - dragRef.current.startX;
      const dy = pt.y - dragRef.current.startY;
      if (allowPan) {
        v.offsetX = dragRef.current.startOffsetX + dx;
        v.offsetY = dragRef.current.startOffsetY + dy;
        renderNow();
      }
    }
  };

  const onPointerUpOrCancel = (e) => {
    if (!open) return;
    const pt = pointersRef.current.get(e.pointerId);
    pointersRef.current.delete(e.pointerId);
    containerRef.current.releasePointerCapture?.(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (dragRef.current && pt) {
      const v = viewRef.current;
      const base = v.mode === "fit" ? computeFitZoom() : 1;
      const notZoomed = v.zoom <= base * 1.01;
      const dx = pt.x - dragRef.current.startX;
      const dy = pt.y - dragRef.current.startY;
      const absX = Math.abs(dx),
        absY = Math.abs(dy);
      if (notZoomed && absX > 60 && absX > absY) {
        setIndex(safeIndex + (dx < 0 ? 1 : -1));
      } else if (notZoomed && dy > 80 && absY > absX) {
        onClose?.();
      }
    }
    dragRef.current = null;
    forceUi();
  };

  const onWheel = (e) => {
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    zoomBy(e.deltaY > 0 ? 1 / 1.1 : 1.1, pt);
  };

  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    naturalRef.current = { w: el.naturalWidth || 0, h: el.naturalHeight || 0 };
    viewRef.current.zoom = computeFitZoom();
    viewRef.current.mode = "fit";
    viewRef.current.offsetX = 0;
    viewRef.current.offsetY = 0;
    renderNow();
    forceUi();
  };

  const renderNow = () => {
    const img = imgRef.current;
    const v = viewRef.current;
    if (!img) return;
    img.style.transform = `translate3d(${v.offsetX}px, ${v.offsetY}px, 0) scale(${v.zoom}) rotate(${v.rotation}deg)`;
  };

  if (!open || !item) return null;

  const btn = "border border-white/25 bg-white/15 text-white px-3 py-2 rounded-lg text-sm backdrop-blur hover:bg-white/20";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9999] select-none touch-none"
      style={{
        cursor: dragRef.current ? "grabbing" : viewRef.current.zoom > (viewRef.current.mode === "fit" ? computeFitZoom() : 1) * 1.01 ? "grab" : "zoom-out",
      }}
      onClick={onClose}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUpOrCancel}
      onPointerCancel={onPointerUpOrCancel}
      aria-modal="true"
      role="dialog"
      aria-label={item ? `Viewing ${item.name}` : "Viewer"}
    >
      {/* Info */}
      <div className="fixed top-3 left-3 text-neutral-200 text-xs bg-black/35 px-2 py-1.5 rounded-md pointer-events-none">
        <div className="font-semibold">{item?.name || ""}</div>
        <div>
          {ui.mode === "fit" ? "Fit" : "Actual"} • Zoom {(ui.zoom * 100).toFixed(0)}% • Rot {ui.rotation}°
          {hasItems ? ` • ${safeIndex + 1}/${items.length}` : ""}
        </div>
        <div>Gestures: pinch, double-tap, swipe ←/→/↓</div>
      </div>

      {/* Top-right actions */}
      <div className="fixed top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={item.src} target="_blank" rel="noreferrer" className={btn}>
          Open
        </a>
        <a href={item.download} className={btn}>
          Download
        </a>
        <button
          className={btn}
          onClick={() => {
            const url = new URL(item.src, location.origin).toString();
            if (navigator.share) navigator.share({ title: item.name, url }).catch(() => {});
            else
              navigator.clipboard
                ?.writeText(url)
                .then(() => alert("Link copied!"))
                .catch(() => {});
          }}
        >
          Share
        </button>
        <button
          className={btn}
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          aria-label="Close"
        >
          × Close
        </button>
      </div>

      {/* Bottom controls */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-wrap justify-center gap-2" onClick={(e) => e.stopPropagation()}>
        <button className={btn} onClick={() => setIndex(safeIndex - 1)}>
          ← Prev
        </button>
        <button className={btn} onClick={() => zoomBy(1 / 1.2, { x: window.innerWidth / 2, y: window.innerHeight / 2 })}>
          – Zoom
        </button>
        <button className={btn} onClick={() => applyMode("actual")}>
          1:1
        </button>
        <button className={btn} onClick={() => applyMode("fit")}>
          Fit
        </button>
        <button className={btn} onClick={() => zoomBy(1.2, { x: window.innerWidth / 2, y: window.innerHeight / 2 })}>
          + Zoom
        </button>
        <button className={btn} onClick={() => rotateBy(90)}>
          ⟳ Rotate
        </button>
        <button
          className={btn}
          onClick={() => {
            playingRef.current = !playingRef.current;
            forceUi();
          }}
        >
          {ui.playing ? "Pause" : "Play"}
        </button>
        <button className={btn} onClick={() => setIndex(safeIndex + 1)}>
          Next →
        </button>
      </div>

      <img
        ref={imgRef}
        src={item.src}
        alt={item.name || ""}
        onLoad={onImgLoad}
        className="max-w-none max-h-none pointer-events-none select-none"
        style={{
          transform: `translate3d(${viewRef.current.offsetX}px, ${viewRef.current.offsetY}px, 0) scale(${viewRef.current.zoom}) rotate(${viewRef.current.rotation}deg)`,
        }}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
