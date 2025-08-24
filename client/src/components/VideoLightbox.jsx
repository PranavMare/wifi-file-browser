import { useEffect, useRef, useState, useMemo } from "react";

export default function VideoLightbox({ open, items, index, setIndex, onClose }) {
  const hasItems = Array.isArray(items) && items.length > 0;
  const safeIndex = hasItems ? ((index % items.length) + items.length) % items.length : 0;
  const item = hasItems ? items[safeIndex] : null;

  // ----- body scroll lock (mobile-safe) -----
  const prevStyles = useRef({});
  const scrollYRef = useRef(0);
  useEffect(() => {
    if (!open) {
      // unlock - restore all body styles with fallbacks
      if (prevStyles.current) {
        document.body.style.overflow = prevStyles.current.overflow || "";
        document.body.style.position = prevStyles.current.position || "";
        document.body.style.top = prevStyles.current.top || "";
        document.body.style.left = prevStyles.current.left || "";
        document.body.style.right = prevStyles.current.right || "";
        document.body.style.width = prevStyles.current.width || "";
      }
      // restore scroll position
      if (typeof scrollYRef.current === "number") {
        requestAnimationFrame(() => {
          window.scrollTo(0, scrollYRef.current);
        });
      }
      return;
    }
    // lock
    prevStyles.current = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
    };
    scrollYRef.current = window.scrollY || window.pageYOffset || 0;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollYRef.current}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    return () => {
      // cleanup if component unmounts while open
      document.body.style.overflow = prevStyles.current.overflow || "";
      document.body.style.position = prevStyles.current.position || "";
      document.body.style.top = prevStyles.current.top || "";
      document.body.style.left = prevStyles.current.left || "";
      document.body.style.right = prevStyles.current.right || "";
      document.body.style.width = prevStyles.current.width || "";

      requestAnimationFrame(() => {
        window.scrollTo(0, scrollYRef.current || 0);
      });
    };
  }, [open]);

  // ----- refs/state -----
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const [uiVisible, setUiVisible] = useState(true); // taps toggle this
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [error, setError] = useState("");

  // resume position
  const storeKey = useMemo(() => (item ? "vidpos:" + new URL(item.src, location.origin).toString() : ""), [item]);

  // keyboard nav
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowRight") setIndex(safeIndex + 1);
      else if (e.key === "ArrowLeft") setIndex(safeIndex - 1);
      else if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key.toLowerCase() === "f") toggleFullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, safeIndex, setIndex, onClose]);

  // load meta / resume
  useEffect(() => {
    if (!open || !item) return;
    setError("");
    setLoading(true);
    setCurrent(0);
    setDuration(0);
    const v = videoRef.current;
    if (!v) return;

    const onLoadedMeta = () => {
      setDuration(v.duration || 0);
      setLoading(false);
      // resume (if valid)
      try {
        const saved = Number(localStorage.getItem(storeKey) || "0");
        if (saved && saved > 0 && saved < (v.duration || 0) - 2) {
          v.currentTime = saved;
        }
      } catch {}
    };
    const onTime = () => {
      setCurrent(v.currentTime || 0);
      // throttle save (every ~2s)
      if ((v.currentTime | 0) % 2 === 0) {
        try {
          localStorage.setItem(storeKey, String(Math.floor(v.currentTime)));
        } catch {}
      }
    };
    const onEnded = () => setIndex(safeIndex + 1);
    const onErr = () => setError("Playback error");

    v.addEventListener("loadedmetadata", onLoadedMeta);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onErr);

    return () => {
      v.removeEventListener("loadedmetadata", onLoadedMeta);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onErr);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, storeKey, safeIndex]);

  // tap/gesture helpers
  const lastTapRef = useRef({ t: 0, x: 0 });
  const dragRef = useRef(null);

  const handleContainerPointerDown = (e) => {
    // Don't interfere with button clicks and UI elements
    if (e.target.closest("button") || e.target.closest("a") || e.target.closest('[role="button"]') || e.target.closest("video")) {
      return;
    }

    // double-tap seek (mobile)
    const now = Date.now();
    const x = e.clientX;
    const dt = now - lastTapRef.current.t;
    const dx = Math.abs(x - lastTapRef.current.x);
    lastTapRef.current = { t: now, x };

    // start swipe tracking
    dragRef.current = { x0: e.clientX, y0: e.clientY, moved: false };

    if (dt < 260 && dx < 40) {
      // double tap: left/right half seek
      const rect = containerRef.current.getBoundingClientRect();
      if (x < rect.left + rect.width / 2) seekBy(-10);
      else seekBy(+10);
    }
  };
  const handleContainerPointerMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x0;
    const dy = e.clientY - dragRef.current.y0;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) dragRef.current.moved = true;
  };
  const handleContainerPointerUp = (e) => {
    // Don't interfere with button clicks and UI elements
    if (e.target.closest("button") || e.target.closest("a") || e.target.closest('[role="button"]') || e.target.closest("video")) {
      return;
    }

    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.x0;
    const dy = e.clientY - dragRef.current.y0;
    const absX = Math.abs(dx),
      absY = Math.abs(dy);

    // swipe to close or nav (when not interacting with native controls)
    if (absY > absX && dy > 80) onClose?.();
    else if (absX > absY && absX > 80) setIndex(safeIndex + (dx < 0 ? 1 : -1));
    else {
      // simple tap toggles UI / play
      if (!dragRef.current.moved) {
        if (uiVisible) togglePlay();
        setUiVisible((v) => !v);
      }
    }
    dragRef.current = null;
  };

  // actions
  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };
  const seekBy = (sec) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.currentTime)) return;
    v.currentTime = Math.max(0, Math.min((v.currentTime || 0) + sec, v.duration || 9e9));
  };
  const toggleMute = () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  };
  const cycleSpeed = () => {
    const list = [1, 1.25, 1.5, 2, 0.5, 0.75];
    const i = (list.indexOf(speed) + 1) % list.length;
    setSpeed(list[i]);
    if (videoRef.current) videoRef.current.playbackRate = list[i];
  };
  const toggleFullscreen = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen();
    } catch {}
  };
  const togglePiP = async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      // @ts-ignore
      if (document.pictureInPictureElement) {
        // @ts-ignore
        await document.exitPictureInPicture();
      } else if (document.pictureInPictureEnabled && !v.disablePictureInPicture) {
        // @ts-ignore
        await v.requestPictureInPicture();
      }
    } catch {}
  };

  const fmt = (s) => {
    if (!Number.isFinite(s)) return "0:00";
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${ss}`;
  };

  // quick nav hit areas (mobile)
  const HitZone = ({ side }) => (
    <button
      aria-label={side === "left" ? "Previous video" : "Next video"}
      onClick={(e) => {
        e.stopPropagation();
        setIndex(safeIndex + (side === "left" ? -1 : 1));
      }}
      className={`absolute inset-y-0 ${side === "left" ? "left-0" : "right-0"} w-1/4 opacity-0`}
      tabIndex={-1}
    />
  );

  // EARLY RETURN handled at the end (so effects still run)
  if (!open || !item) return null;

  const btn = "border border-white/25 bg-white/15 text-white px-3 py-2 rounded-lg text-sm backdrop-blur";
  const btnSm = "border border-white/25 bg-white/15 text-white px-2 py-1.5 rounded-md text-xs backdrop-blur";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[9998] bg-black/90 flex items-center justify-center select-none touch-none"
      aria-modal="true"
      role="dialog"
      aria-label={item?.name ? `Playing ${item.name}` : "Video"}
      onPointerDown={handleContainerPointerDown}
      onPointerMove={handleContainerPointerMove}
      onPointerUp={handleContainerPointerUp}
      onClick={(e) => {
        // Only close if clicking on the background, not on UI elements or video
        if (!e.target.closest("button") && !e.target.closest("a") && !e.target.closest('[role="button"]') && !e.target.closest("video")) {
          onClose?.();
        }
      }}
    >
      {/* loading / error */}
      {loading && <div className="absolute top-1/2 -translate-y-1/2 text-white/80 text-sm pointer-events-none">Loading…</div>}
      {!!error && <div className="absolute top-1/2 -translate-y-1/2 text-red-300 text-sm pointer-events-none">{error}</div>}

      {/* Top bar */}
      {uiVisible && (
        <div
          className="fixed top-3 left-3 right-3 z-20 flex items-center justify-between gap-2"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-white/90 text-xs max-w-[60vw] truncate">{item?.name || ""}</div>
          <div className="flex items-center gap-2">
            <button className={btnSm} onClick={toggleMute}>
              {muted ? "Unmute" : "Mute"}
            </button>
            <button className={btnSm} onClick={cycleSpeed}>
              {speed}x
            </button>
            <button className={btnSm} onClick={togglePiP}>
              PiP
            </button>
            <button className={btnSm} onClick={toggleFullscreen}>
              Full
            </button>
            <a className={btnSm} href={item.src} target="_blank" rel="noreferrer">
              Open
            </a>
            <a className={btnSm} href={item.download}>
              Download
            </a>
            <button
              className={btnSm}
              onClick={(e) => {
                e.stopPropagation();
                onClose?.();
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Bottom bar */}
      {uiVisible && (
        <div
          className="fixed bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2"
          onPointerDownCapture={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button className={btn} onClick={() => setIndex(safeIndex - 1)}>
            ← Prev
          </button>
          <button className={btn} onClick={() => seekBy(-10)}>
            ⟲ 10s
          </button>
          <button className={btn} onClick={togglePlay}>
            ⏯
          </button>
          <button className={btn} onClick={() => seekBy(+10)}>
            10s ⟳
          </button>
          <button className={btn} onClick={() => setIndex(safeIndex + 1)}>
            Next →
          </button>
        </div>
      )}

      {/* Progress pill */}
      <div className="fixed bottom-3 right-3 z-20 text-white/90 text-sm border border-white/20 rounded-md px-2 py-1 pointer-events-none">
        {fmt(current)} / {fmt(duration)} &nbsp;•&nbsp; {safeIndex + 1}/{items.length}
      </div>

      {/* Quick nav hit zones (invisible) */}
      <HitZone side="left" />
      <HitZone side="right" />

      {/* The player (clicks inside shouldn't close) */}
      <video
        ref={videoRef}
        className="max-w-[96vw] max-h-[80vh] bg-black"
        src={item.src}
        autoPlay
        playsInline
        preload="metadata"
        controls={uiVisible} // show native controls when UI is visible
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
