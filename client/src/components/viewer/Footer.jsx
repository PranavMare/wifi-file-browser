import React from "react";

const btn = "px-3 py-1.5 rounded-md border border-white/30 bg-white/10 text-white text-sm hover:bg-white/20";

export default function Footer({ atBase, zoomPct, onToggle, onFit, onReset }) {
  return (
    <div className="row-start-3 row-end-4 z-20 px-3 py-2 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center gap-2">
      <span className="text-xs text-white/80 mr-2">{zoomPct}%</span>
      <button className={btn} onClick={onToggle}>
        {atBase ? "Zoom In" : "Fit"}
      </button>
      <button className={btn} onClick={onFit}>
        Fit
      </button>
      <button className={btn} onClick={onReset}>
        Reset
      </button>
    </div>
  );
}
