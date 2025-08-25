// src/components/DocViewer.jsx
import React from "react";

export default function DocViewer({ open, onClose, doc }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div className="w-full h-[85vh] max-w-5xl bg-white dark:bg-[#0d1117] rounded-2xl overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-2 border-b border-black/10 dark:border-white/10">
          <div className="font-medium text-sm truncate">{doc.name}</div>
          <button className="px-3 py-1.5 rounded-lg border border-black/10 dark:border-white/20" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="w-full h-full">
          {doc.kind === "pdf" ? (
            <iframe title={doc.name} src={doc.href} className="w-full h-full" />
          ) : (
            <pre className="w-full h-full p-4 overflow-auto text-sm whitespace-pre-wrap break-words text-neutral-900 dark:text-white">
              {doc.content ?? "Loading…"}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
