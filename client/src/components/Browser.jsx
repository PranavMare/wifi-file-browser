// src/components/Browser.jsx
import React, { useMemo, useState, useCallback, lazy, Suspense } from "react";
import { Link, useLocation } from "react-router-dom";
import Toolbar from "./Toolbar";
import DocViewer from "./DocViewer";
import FileCard from "./FileCard";
import useDirectory from "../hooks/useDirectory";

const FullscreenViewer = lazy(() => import("./FullscreenViewer"));
const VideoLightbox = lazy(() => import("./VideoLightbox"));

function useRelPath() {
  const { pathname } = useLocation();
  const m = pathname.match(/^\/browse\/(.*)$/);
  return m ? decodeURIComponent(m[1]) : "";
}

export default function Browser() {
  const rel = useRelPath();
  const { loading, err, filter, setFilter, sortKey, setSortKey, q, setQ, filteredSorted, pageItems, sentinelRef } = useDirectory(rel);

  const parentRel = useMemo(() => {
    const segs = rel.split("/").filter(Boolean);
    segs.pop();
    return segs.join("/");
  }, [rel]);

  // Images for fullscreen
  const images = useMemo(
    () => filteredSorted.filter((e) => !e.is_dir && e.category === "image").map((e) => ({ src: e.file, name: e.name, download: e.download })),
    [filteredSorted]
  );
  const imgIndexBySrc = useMemo(() => {
    const m = new Map();
    images.forEach((it, i) => m.set(it.src, i));
    return m;
  }, [images]);
  const [viewer, setViewer] = useState({ open: false, index: 0 });
  const openViewer = useCallback(
    (fileHref) => {
      const idx = imgIndexBySrc.get(fileHref);
      if (idx != null) setViewer({ open: true, index: idx });
    },
    [imgIndexBySrc]
  );
  const setIndexWrapped = useCallback((i) => setViewer((v) => ({ ...v, index: ((i % images.length) + images.length) % images.length })), [images.length]);

  // Videos for lightbox
  const videos = useMemo(
    () => filteredSorted.filter((e) => !e.is_dir && e.category === "video").map((e) => ({ src: e.file, name: e.name, download: e.download })),
    [filteredSorted]
  );
  const vidIndexBySrc = useMemo(() => {
    const m = new Map();
    videos.forEach((it, i) => m.set(it.src, i));
    return m;
  }, [videos]);
  const [videoViewer, setVideoViewer] = useState({ open: false, index: 0 });
  const openVideo = useCallback(
    (fileHref) => {
      const idx = vidIndexBySrc.get(fileHref);
      if (idx != null) setVideoViewer({ open: true, index: idx });
    },
    [vidIndexBySrc]
  );
  const setVideoIndexWrapped = useCallback(
    (i) => setVideoViewer((v) => ({ ...v, index: ((i % videos.length) + videos.length) % videos.length })),
    [videos.length]
  );

  // Doc viewer
  const [doc, setDoc] = useState({ open: false, href: "", name: "", kind: "text", content: null });
  const openDoc = useCallback((fileHref, name) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    if (ext === "pdf") setDoc({ open: true, href: fileHref, name, kind: "pdf", content: null });
    else if (["txt", "md", "csv", "json", "log"].includes(ext)) setDoc({ open: true, href: fileHref, name, kind: "text", content: null });
    else window.open(fileHref, "_blank", "noopener,noreferrer");
  }, []);
  React.useEffect(() => {
    if (!doc.open || doc.kind !== "text") return;
    let abort = false;
    (async () => {
      try {
        const res = await fetch(doc.href, { credentials: "include" });
        const text = await res.text();
        if (!abort) setDoc((v) => ({ ...v, content: text }));
      } catch {}
    })();
    return () => {
      abort = true;
    };
  }, [doc.open, doc.href, doc.kind]);

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
    <div className="min-h-screen p-4 font-sans bg-white text-neutral-900 dark:bg-[#232939ff] dark:text-white">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-2 text-sm">
        {crumbs.map((c, i) => (
          <span key={c.href}>
            {i ? " / " : ""}
            {i < crumbs.length - 1 ? (
              <Link className="text-blue-600 hover:underline dark:text-blue-300" to={c.href}>
                {c.name}
              </Link>
            ) : (
              <strong>{c.name}</strong>
            )}
          </span>
        ))}
      </nav>

      <Toolbar rel={rel} parentRel={parentRel} filter={filter} setFilter={setFilter} q={q} setQ={setQ} sortKey={sortKey} setSortKey={setSortKey} />

      {loading && <div className="py-5 text-neutral-600 dark:text-white/80">Loading…</div>}
      {err && !loading && <div className="py-5 text-red-600 dark:text-red-300">Error: {err}</div>}
      {!loading && !err && pageItems.length === 0 && <div className="py-6 text-neutral-600 dark:text:white/70">No items</div>}

      <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 gap-1" role="list">
        {pageItems.map((e, i) => (
          <FileCard key={e.name + ":" + i} rel={rel} entry={e} onOpenImage={openViewer} onOpenVideo={openVideo} onOpenDoc={openDoc} />
        ))}
      </div>

      <div ref={sentinelRef} className="h-px" />

      {/* Viewers */}
      <Suspense fallback={null}>
        <FullscreenViewer
          open={viewer.open}
          items={images}
          index={viewer.index}
          setIndex={setIndexWrapped}
          onClose={() => setViewer((v) => ({ ...v, open: false }))}
        />
      </Suspense>
      <Suspense fallback={null}>
        <VideoLightbox
          open={videoViewer.open}
          items={videos}
          index={videoViewer.index}
          setIndex={setVideoIndexWrapped}
          onClose={() => setVideoViewer((v) => ({ ...v, open: false }))}
        />
      </Suspense>

      <DocViewer open={doc.open} doc={doc} onClose={() => setDoc({ open: false, href: "", name: "", kind: "text", content: null })} />
    </div>
  );
}
