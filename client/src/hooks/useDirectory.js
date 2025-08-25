// src/hooks/useDirectory.js
import { useEffect, useMemo, useRef, useState } from "react";
import { listDir } from "../lib/api";

export const FILTERS = {
  all: new Set(["image", "video", "audio", "doc", "archive", "other"]),
  images: new Set(["image"]),
  videos: new Set(["video"]),
  docs: new Set(["doc"]),
  others: new Set(["audio", "archive", "other"]),
};

const PAGE_SIZE = 120;

export default function useDirectory(rel) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortKey, setSortKey] = useState("time-desc");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  // load & persist prefs
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("browser_prefs") || "{}");
      if (saved.filter) setFilter(saved.filter);
      if (saved.sortKey) setSortKey(saved.sortKey);
      if (saved.q) setQ(saved.q);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem("browser_prefs", JSON.stringify({ filter, sortKey, q }));
  }, [filter, sortKey, q]);

  // fetch current folder
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const data = await listDir(rel);
        if (alive) {
          setItems(data);
          setPage(1);
        }
      } catch (e) {
        if (alive) setErr(e?.message || "Failed to load");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [rel]);

  useEffect(() => setPage(1), [filter, sortKey, q]);

  const filteredSorted = useMemo(() => {
    let arr = items.filter((e) => e.is_dir || FILTERS[filter].has(e.category));
    if (q.trim()) {
      const term = q.toLowerCase();
      arr = arr.filter((e) => e.name.toLowerCase().includes(term));
    }
    const [field, order] = sortKey.split("-");
    const rev = order === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      let av = 0,
        bv = 0;
      if (field === "time") {
        av = a.mtime_ts || 0;
        bv = b.mtime_ts || 0;
      } else if (field === "size") {
        av = a.size || 0;
        bv = b.size || 0;
      }
      if (av === bv) return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
      return rev * (av - bv);
    });
    return arr;
  }, [items, filter, sortKey, q]);

  const pageItems = useMemo(() => filteredSorted.slice(0, page * PAGE_SIZE), [filteredSorted, page]);

  // infinite scroll sentinel
  const sentinelRef = useRef(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const en = entries[0];
        if (en.isIntersecting) {
          setPage((p) => (p * PAGE_SIZE < filteredSorted.length ? p + 1 : p));
        }
      },
      { rootMargin: "1200px 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [filteredSorted.length]);

  return {
    loading,
    err,
    filter,
    setFilter,
    sortKey,
    setSortKey,
    q,
    setQ,
    filteredSorted,
    pageItems,
    sentinelRef,
  };
}
