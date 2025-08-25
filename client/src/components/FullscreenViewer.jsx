import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Header from "./viewer/Header";
import Stage from "./viewer/Stage";
import Footer from "./viewer/Footer";
import usePanZoom from "./viewer/usePanZoom";

/** Props: { open, items, index, setIndex, onClose } */
export default function FullscreenViewer({ open, items, index, setIndex, onClose }) {
  if (!open || !Array.isArray(items) || items.length === 0) return null;
  return createPortal(<Overlay items={items} index={index} setIndex={setIndex} onClose={onClose} />, document.body);
}

function Overlay({ items, index, setIndex, onClose }) {
  const total = items.length;
  const safeIndex = useMemo(() => ((index % total) + total) % total, [index, total]);
  const current = items[safeIndex];

  // lock page scroll while overlay is open
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevOB = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.documentElement.style.overscrollBehavior = prevOB;
    };
  }, []);

  // refs passed to Stage + pan/zoom hook
  const stageRef = useRef(null);
  const imgRef = useRef(null);

  const { ui, handlers, actions } = usePanZoom(stageRef, imgRef, {
    onSwipeLeft: () => setIndex(safeIndex + 1),
    onSwipeRight: () => setIndex(safeIndex - 1),
  });

  // loading/error for the current image
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // reset loading state whenever we change image
  useEffect(() => {
    setLoading(true);
    setError("");
  }, [safeIndex]);

  // keyboard nav
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setIndex(safeIndex + 1);
      else if (e.key === "ArrowLeft") setIndex(safeIndex - 1);
      else if (e.key === "0") actions.fit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safeIndex, setIndex, onClose, actions]);

  // preload neighbors
  useEffect(() => {
    const next = new Image();
    const prev = new Image();
    next.src = items[(safeIndex + 1) % total]?.src || "";
    prev.src = items[(safeIndex - 1 + total) % total]?.src || "";
  }, [items, safeIndex, total]);

  return (
    <div
      className="fixed inset-0 z-[9999] grid grid-rows-[auto_1fr_auto] bg-black text-white select-none"
      style={{ overscrollBehavior: "none" }}
      aria-modal="true"
      role="dialog"
      aria-label={current?.name ? `Viewing ${current.name}` : "Image viewer"}
    >
      {/* Header (row 1) */}
      <Header
        name={current?.name || "Image"}
        index={safeIndex + 1}
        total={total}
        onPrev={() => setIndex(safeIndex - 1)}
        onNext={() => setIndex(safeIndex + 1)}
        onClose={onClose}
        downloadHref={current?.download || current?.src}
      />

      {/* Stage (row 2) -> image is clamped inside this row only */}
      <Stage
        ref={stageRef}
        imgRef={imgRef}
        src={current.src}
        alt={current?.name || ""}
        loading={loading}
        error={error}
        onLoad={() => {
          handlers.onImgLoad(); // compute fit -> center -> render
          setLoading(false);
        }}
        onError={() => {
          setLoading(false);
          setError("Failed to load image");
        }}
        onWheel={handlers.onWheel}
        onPointerDown={handlers.onPointerDown}
        onPointerMove={handlers.onPointerMove}
        onPointerUp={handlers.onPointerUp}
        onPointerCancel={handlers.onPointerUp}
      />

      {/* Footer (row 3) */}
      <Footer atBase={ui.atBase} zoomPct={ui.zoomPct} onToggle={() => actions.toggleZoom()} onFit={() => actions.fit()} onReset={() => actions.reset()} />
    </div>
  );
}
