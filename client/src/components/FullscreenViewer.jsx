// client/src/components/FullscreenViewer.jsx
import React, { useEffect, useRef, useState } from "react";

export default function FullscreenViewer({ open, items, index, setIndex, onClose }) {
  const valid = Array.isArray(items) && items.length > 0;
  const total = valid ? items.length : 0;
  const safeIndex = valid ? ((index % total) + total) % total : 0;
  const item = valid ? items[safeIndex] : null;

  const wrapRef = useRef(null);
  const imgRef = useRef(null);

  const natural = useRef({ w: 0, h: 0 });
  const view = useRef({ base: 1, zoom: 1, x: 0, y: 0 });

  const pointers = useRef(new Map()); // id -> {x,y,t}
  const dragStart = useRef(null); // {x,y,vx,vy,t}
  const pinchStart = useRef(null); // {dist, zoom}
  const [loading, setLoading] = useState(true);

  const ZMAX = 6;
  const SWIPE_PX = 70;

  // ---------- math + rendering ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const computeFit = () => {
    const c = wrapRef.current;
    const { w, h } = natural.current;
    if (!c || !w || !h) return 1;
    return Math.min(c.clientWidth / w, c.clientHeight / h) || 1;
  };

  const clampPan = () => {
    const c = wrapRef.current;
    const { w, h } = natural.current;
    if (!c || !w || !h) return;

    const v = view.current;
    const sw = w * v.zoom;
    const sh = h * v.zoom;
    const cw = c.clientWidth;
    const ch = c.clientHeight;

    const clampAxis = (img, cont, pos) => {
      if (img <= cont) return (cont - img) / 2; // center & lock axis
      return clamp(pos, cont - img, 0);
    };

    v.x = clampAxis(sw, cw, v.x);
    v.y = clampAxis(sh, ch, v.y);
  };

  const renderImage = () => {
    const el = imgRef.current;
    if (!el) return;
    const v = view.current;
    el.style.transformOrigin = "0 0";
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`;
  };

  const zoomAround = (factor, pivot) => {
    const v = view.current;
    const minZ = v.base; // never below fit
    const zNew = clamp(v.zoom * factor, minZ, ZMAX);
    if (zNew === v.zoom) return;

    const ratio = zNew / v.zoom;
    v.x = v.x * ratio + pivot.x * (1 - ratio);
    v.y = v.y * ratio + pivot.y * (1 - ratio);
    v.zoom = zNew;

    clampPan();
    renderImage();
  };

  const rectPoint = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp || Date.now() };
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // ---------- lifecycle ----------
  useEffect(() => {
    setLoading(true);
  }, [safeIndex]);

  useEffect(() => {
    const onResize = () => {
      const base = computeFit();
      const atBase = Math.abs(view.current.zoom - view.current.base) < 0.01;
      view.current.base = base;
      if (atBase) {
        view.current.zoom = base;
        view.current.x = 0;
        view.current.y = 0;
      }
      clampPan();
      renderImage();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ---------- image load ----------
  const onImgLoad = () => {
    const el = imgRef.current;
    if (!el) return;
    natural.current = { w: el.naturalWidth || 0, h: el.naturalHeight || 0 };
    const base = computeFit();
    view.current = { base, zoom: base, x: 0, y: 0 };
    clampPan();
    renderImage();
    setLoading(false);
  };

  // ---------- input handlers ----------
  const onWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = rectPoint(e);
    zoomAround(e.deltaY > 0 ? 1 / 1.1 : 1.1, p);
  };

  const onPointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("a")) return;
    e.preventDefault();
    e.stopPropagation();
    wrapRef.current.setPointerCapture(e.pointerId);
    const p = rectPoint(e);
    pointers.current.set(e.pointerId, p);

    if (pointers.current.size === 1) {
      dragStart.current = { x: p.x, y: p.y, vx: view.current.x, vy: view.current.y, t: p.t };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: dist(a, b), zoom: view.current.zoom };
    }
  };

  const onPointerMove = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    if (!e.target.closest("button") && !e.target.closest("a")) {
      e.preventDefault();
      e.stopPropagation();
    }

    const p = rectPoint(e);
    pointers.current.set(e.pointerId, p);

    // pinch
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dNow = dist(a, b);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const target = (dNow / Math.max(1, pinchStart.current.dist)) * pinchStart.current.zoom;
      const factor = target / view.current.zoom;
      zoomAround(factor, center);
      return;
    }

    // pan
    if (pointers.current.size === 1 && dragStart.current) {
      const base = view.current.base;
      const atBase = Math.abs(view.current.zoom - base) < 0.01;
      const dx = p.x - dragStart.current.x;
      const dy = p.y - dragStart.current.y;

      if (!atBase) {
        view.current.x = dragStart.current.vx + dx;
        view.current.y = dragStart.current.vy + dy;
        clampPan();
        renderImage();
      }
    }
  };

  const onPointerUp = (e) => {
    if (!pointers.current.has(e.pointerId)) return;
    if (!e.target.closest("button") && !e.target.closest("a")) {
      e.preventDefault();
      e.stopPropagation();
    }

    const p = pointers.current.get(e.pointerId);
    pointers.current.delete(e.pointerId);
    wrapRef.current.releasePointerCapture(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;

    // swipe (only at base zoom)
    if (dragStart.current && p) {
      const base = view.current.base;
      const atBase = Math.abs(view.current.zoom - base) < 0.01;
      const dx = p.x - dragStart.current.x;
      if (atBase && Math.abs(dx) > SWIPE_PX) {
        setIndex(dx < 0 ? safeIndex + 1 : safeIndex - 1);
      }
    }

    dragStart.current = null;
  };

  // ---------- early return AFTER all hooks to keep hook order stable ----------
  if (!open || !item) return null;

  // ---------- UI ----------
  const btn = "px-3 py-1.5 rounded-md border border-white/30 bg-white/10 text-white text-sm hover:bg-white/20";

  return (
    <div
      ref={wrapRef}
      className="fixed inset-0 z-[9999] bg-black text-white select-none"
      style={{ touchAction: "none" }}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="dialog"
      aria-modal="true"
      aria-label={item?.name ? `Viewing ${item.name}` : "Image viewer"}
    >
      {/* Top bar */}
      <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between">
        <div className="text-sm opacity-90">
          {item?.name || "Image"} {valid ? `• ${safeIndex + 1} / ${total}` : ""}
        </div>
        <div className="flex items-center gap-2">
          <button className={btn} onClick={() => setIndex(safeIndex - 1)} aria-label="Previous">
            Prev
          </button>
          <button className={btn} onClick={() => setIndex(safeIndex + 1)} aria-label="Next">
            Next
          </button>
          <button className={btn} onClick={() => onClose?.()} aria-label="Close">
            Close
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="absolute inset-0 flex items-center justify-center">
        {loading && <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">Loading…</div>}
        <img
          ref={imgRef}
          src={item.src}
          alt={item?.name || ""}
          onLoad={onImgLoad}
          className="max-w-none max-h-none origin-top-left pointer-events-none select-none"
          draggable={false}
          style={{ opacity: loading ? 0 : 1, transition: "opacity 180ms ease" }}
        />
      </div>

      {/* Bottom bar */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center gap-2">
        <button
          className={btn}
          onClick={() => {
            const r = wrapRef.current;
            const pivot = r ? { x: r.clientWidth / 2, y: r.clientHeight / 2 } : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            const base = view.current.base;
            const atBase = Math.abs(view.current.zoom - base) < 0.01;
            const target = atBase ? base * 2 : base;
            zoomAround(target / view.current.zoom, pivot);
          }}
        >
          {Math.abs(view.current.zoom - view.current.base) < 0.01 ? "Zoom In" : "Fit"}
        </button>
        <button
          className={btn}
          onClick={() => {
            view.current.zoom = view.current.base;
            view.current.x = 0;
            view.current.y = 0;
            clampPan();
            renderImage();
          }}
        >
          Reset
        </button>
      </div>
    </div>
  );
}
