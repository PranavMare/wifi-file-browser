import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Pan/zoom bounded to a fixed container.
 * - Minimum zoom is the "fit" scale, so the image always stays within the stage.
 * - Panning is clamped so the image cannot cross the stage edges.
 */
export default function usePanZoom(containerRef, imgRef, { onSwipeLeft, onSwipeRight } = {}) {
  const natural = useRef({ w: 0, h: 0 });
  const view = useRef({ base: 1, zoom: 1, x: 0, y: 0 });

  const pointers = useRef(new Map());
  const dragStart = useRef(null);
  const pinchStart = useRef(null);
  const lastTap = useRef(0);
  const raf = useRef(null);

  const SWIPE_PX = 70;
  const ZMAX = 8;

  const [ui, setUI] = useState({ atBase: true, zoomPct: 100 });

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const computeFit = useCallback(() => {
    const c = containerRef.current;
    const { w, h } = natural.current;
    if (!c || !w || !h) return 1;
    const cw = Math.max(1, c.clientWidth);
    const ch = Math.max(1, c.clientHeight);
    return Math.min(cw / w, ch / h) || 1;
  }, [containerRef]);

  const clampPan = useCallback(() => {
    const c = containerRef.current;
    const { w, h } = natural.current;
    if (!c || !w || !h) return;
    const v = view.current;
    const sw = w * v.zoom;
    const sh = h * v.zoom;
    const cw = c.clientWidth;
    const ch = c.clientHeight;

    const clampAxis = (img, cont, pos) => (img <= cont ? (cont - img) / 2 : clamp(pos, cont - img, 0));
    v.x = clampAxis(sw, cw, v.x);
    v.y = clampAxis(sh, ch, v.y);
  }, [containerRef]);

  const render = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    const v = view.current;
    el.style.transformOrigin = "0 0";
    el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.zoom})`;
  }, [imgRef]);

  const scheduleRender = () => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      render();
      raf.current = null;
    });
  };

  const commitUI = useCallback(() => {
    const v = view.current;
    setUI({
      atBase: Math.abs(v.zoom - v.base) < 0.01,
      zoomPct: Math.round((v.zoom / v.base) * 100),
    });
  }, []);

  const zoomAround = useCallback(
    (factor, pivot) => {
      const v = view.current;
      const minZ = v.base;
      const nextZ = clamp(v.zoom * factor, minZ, ZMAX);
      if (nextZ === v.zoom) return;

      const ratio = nextZ / v.zoom;
      v.x = v.x * ratio + pivot.x * (1 - ratio);
      v.y = v.y * ratio + pivot.y * (1 - ratio);
      v.zoom = nextZ;

      clampPan();
      scheduleRender();
      commitUI();
    },
    [clampPan, commitUI]
  );

  const rectPoint = (e) => {
    const r = containerRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp || Date.now() };
  };

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  // public handlers
  const onImgLoad = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    natural.current = { w: el.naturalWidth || 0, h: el.naturalHeight || 0 };
    const base = computeFit();
    view.current = { base, zoom: base, x: 0, y: 0 };
    clampPan();
    render();
    commitUI();
  }, [imgRef, computeFit, clampPan, render, commitUI]);

  const onWheel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const p = rectPoint(e);
    const factor = Math.exp(-e.deltaY / 300);
    zoomAround(factor, p);
  };

  const onPointerDown = (e) => {
    if (e.target.closest("button") || e.target.closest("a")) return;
    e.preventDefault();
    e.stopPropagation();
    containerRef.current.setPointerCapture(e.pointerId);
    const p = rectPoint(e);
    pointers.current.set(e.pointerId, p);

    // double tap / click to toggle zoom
    const now = p.t;
    if (now - lastTap.current < 300 && pointers.current.size === 1) {
      const v = view.current;
      const base = v.base;
      const atBase = Math.abs(v.zoom - base) < 0.01;
      const target = atBase ? Math.min(base * 2, ZMAX) : base;
      zoomAround(target / v.zoom, p);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }

    if (pointers.current.size === 1) {
      dragStart.current = { x: p.x, y: p.y, vx: view.current.x, vy: view.current.y, t: p.t };
    } else if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      pinchStart.current = { dist: Math.max(1, dist(a, b)), zoom: view.current.zoom };
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

    // pinch zoom
    if (pointers.current.size === 2 && pinchStart.current) {
      const [a, b] = Array.from(pointers.current.values());
      const dNow = Math.max(1, dist(a, b));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const factor = (dNow / pinchStart.current.dist) * (pinchStart.current.zoom / view.current.zoom);
      zoomAround(factor, center);
      return;
    }

    // pan (only when zoomed in)
    if (pointers.current.size === 1 && dragStart.current) {
      const base = view.current.base;
      const atBase = Math.abs(view.current.zoom - base) < 0.01;
      const dx = p.x - dragStart.current.x;
      const dy = p.y - dragStart.current.y;
      if (!atBase) {
        view.current.x = dragStart.current.vx + dx;
        view.current.y = dragStart.current.vy + dy;
        clampPan();
        scheduleRender();
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
    try {
      containerRef.current.releasePointerCapture(e.pointerId);
    } catch {}
    if (pointers.current.size < 2) pinchStart.current = null;

    // swipe nav at base zoom
    if (dragStart.current && p) {
      const base = view.current.base;
      const atBase = Math.abs(view.current.zoom - base) < 0.01;
      const dx = p.x - dragStart.current.x;
      const dt = p.t - dragStart.current.t || 1;
      const fast = Math.abs(dx / dt) > 0.4;
      if (atBase && (Math.abs(dx) > SWIPE_PX || (fast && Math.abs(dx) > 30))) {
        dx < 0 ? onSwipeLeft?.() : onSwipeRight?.();
      }
    }
    dragStart.current = null;
  };

  // react to container resizes (header/footer height changes, window resize, etc.)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const base = computeFit();
      const wasAtBase = Math.abs(view.current.zoom - view.current.base) < 0.01;
      view.current.base = base;
      if (wasAtBase) {
        view.current.zoom = base;
        view.current.x = 0;
        view.current.y = 0;
      }
      clampPan();
      render();
      commitUI();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [containerRef, computeFit, clampPan, render, commitUI]);

  // public actions for footer
  const fit = useCallback(() => {
    const base = computeFit();
    view.current.base = base;
    view.current.zoom = base;
    view.current.x = 0;
    view.current.y = 0;
    clampPan();
    render();
    commitUI();
  }, [computeFit, clampPan, render, commitUI]);

  const toggleZoom = useCallback(() => {
    const c = containerRef.current;
    const pivot = c ? { x: c.clientWidth / 2, y: c.clientHeight / 2 } : { x: 0, y: 0 };
    const v = view.current;
    const base = v.base;
    const atBase = Math.abs(v.zoom - base) < 0.01;
    const target = atBase ? Math.min(base * 2, ZMAX) : base;
    zoomAround(target / v.zoom, pivot);
  }, [containerRef, zoomAround]);

  const reset = useCallback(() => {
    view.current.zoom = view.current.base;
    view.current.x = 0;
    view.current.y = 0;
    clampPan();
    render();
    commitUI();
  }, [clampPan, render, commitUI]);

  return {
    ui,
    handlers: { onImgLoad, onWheel, onPointerDown, onPointerMove, onPointerUp },
    actions: { fit, toggleZoom, reset },
  };
}
