import React, { forwardRef } from "react";

/**
 * Middle row of the grid. This is the ONLY place the image can live.
 * The container is overflow-hidden and receives all wheel/pointer events.
 */
const Stage = forwardRef(function Stage(
  { imgRef, src, alt, loading, error, onLoad, onError, onWheel, onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
  ref
) {
  return (
    <div
      ref={ref}
      className="row-start-2 row-end-3 relative overflow-hidden"
      style={{ touchAction: "none" }} // avoid browser gestures
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {loading && !error && <div className="absolute inset-0 grid place-items-center text-white/70 text-sm">Loading…</div>}
      {error && <div className="absolute inset-0 grid place-items-center text-red-300 text-sm">{error}</div>}

      {/* The image is transformed (translate+scale). It never captures events. */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        onLoad={onLoad}
        onError={onError}
        draggable={false}
        className="max-w-none max-h-none origin-top-left select-none will-change-transform pointer-events-none"
        style={{ opacity: loading ? 0 : 1, transition: "opacity 180ms ease" }}
      />
    </div>
  );
});

export default Stage;
