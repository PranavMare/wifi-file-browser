// server/utils/paths.js
import path from "path";

export function safeResolve(baseDir, rel = "") {
  const abs = path.resolve(baseDir, rel);
  const baseAbs = path.resolve(baseDir);
  if (!abs.startsWith(baseAbs)) throw new Error("Forbidden");
  return abs;
}

export function toUrlPath(rel) {
  return rel.split(path.sep).map(encodeURIComponent).join("/");
}
