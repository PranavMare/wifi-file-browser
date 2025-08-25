import React from "react";

const btn = "px-3 py-1.5 rounded-md border border-white/30 bg-white/10 text-white text-sm hover:bg-white/20";

export default function Header({ name, index, total, onPrev, onNext, onClose, downloadHref }) {
  return (
    <div className="row-start-1 row-end-2 z-20 px-3 py-2 bg-gradient-to-b from-black/60 to-transparent flex items-center justify-between">
      <div className="text-sm opacity-90 truncate">
        {name} • {index} / {total}
      </div>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={onPrev} aria-label="Previous">
          Prev
        </button>
        <button className={btn} onClick={onNext} aria-label="Next">
          Next
        </button>
        <a className={btn} href={downloadHref} target="_blank" rel="noreferrer" aria-label="Download">
          Download
        </a>
        <button className={btn} onClick={onClose} aria-label="Close">
          Close
        </button>
      </div>
    </div>
  );
}
