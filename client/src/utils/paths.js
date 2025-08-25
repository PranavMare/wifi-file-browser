// src/utils/paths.js
export function joinSegments(...parts) {
  const segs = [];
  for (const p of parts) {
    if (!p) continue;
    for (const s of String(p).split("/")) {
      if (s) segs.push(encodeURIComponent(s));
    }
  }
  return segs.join("/");
}

export function toFolderRoute(rel, child) {
  const joined = joinSegments(rel, child);
  return joined ? `/browse/${joined}` : "/browse";
}
