import { useEffect } from "react";

export default function VideoLightbox({ open, items, index, setIndex, onClose }) {
  if (!open || !items?.length) return null;
  const safeIndex = ((index % items.length) + items.length) % items.length;
  const item = items[safeIndex];

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setIndex(safeIndex + 1);
      else if (e.key === "ArrowLeft") setIndex(safeIndex - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [safeIndex, setIndex, onClose]);

  const btn = "border border-white/25 bg-white/15 text-white px-3 py-2 rounded-lg text-sm backdrop-blur hover:bg-white/20";

  return (
    <div
      className="fixed inset-0 z-[9998] bg-black/90 flex items-center justify-center"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
      aria-label={item?.name ? `Playing ${item.name}` : "Video"}
    >
      {/* Controls */}
      <div className="fixed top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a href={item.src} target="_blank" rel="noreferrer" className={btn}>
          Open
        </a>
        <a href={item.download} className={btn}>
          Download
        </a>
        <button className={btn} onClick={onClose}>
          × Close
        </button>
      </div>

      {/* Nav */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <button className={btn} onClick={() => setIndex(safeIndex - 1)}>
          ← Prev
        </button>
        <button className={btn} onClick={() => setIndex(safeIndex + 1)}>
          Next →
        </button>
      </div>

      {/* Player */}
      <video
        className="max-w-[96vw] max-h-[80vh] bg-black"
        src={item.src}
        controls
        autoPlay
        playsInline
        preload="metadata"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
