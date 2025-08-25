// src/components/Toolbar.jsx
import React from "react";
import { Link } from "react-router-dom";
import { FILTERS } from "../hooks/useDirectory";
import { toFolderRoute } from "../utils/paths";

export default function Toolbar({ rel, parentRel, filter, setFilter, q, setQ, sortKey, setSortKey }) {
  return (
    <div className="-mx-3 mb-3 sticky top-0 z-10 px-3 py-2 border-b bg-white/80 border-neutral-200 backdrop-blur dark:bg-white/10 dark:border-white/15">
      <div className="flex flex-wrap items-center gap-3">
        {rel ? (
          <Link to={toFolderRoute(parentRel, "")} className="text-blue-600 hover:underline dark:text-blue-300">
            &larr; Up
          </Link>
        ) : (
          <span className="text-neutral-400 dark:text-white/60">&larr; Up</span>
        )}

        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-700 dark:text-white/80">Filter:</span>
          {Object.keys(FILTERS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`rounded-full px-3 py-1.5 text-sm border transition
                ${filter === key ? "font-semibold border-neutral-800 dark:border-white" : "border-neutral-300 dark:border-white/20"}`}
            >
              {key[0].toUpperCase() + key.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm min-w-[12rem] outline-none
                       focus:ring-2 focus:ring-blue-500
                       dark:bg-white/10 dark:text-white dark:border-white/20
                       placeholder:text-neutral-400 dark:placeholder:text-white/60"
            placeholder="Search files…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search files by name"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              aria-label="Clear search"
              className="border border-neutral-300 rounded-full px-2.5 py-1.5 text-sm dark:border-white/25"
            >
              ×
            </button>
          )}
        </div>

        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <span className="text-sm text-neutral-700 dark:text-white/80">Sort:</span>
          {[
            ["time-desc", "Newest"],
            ["time-asc", "Oldest"],
            ["size-desc", "Largest"],
            ["size-asc", "Smallest"],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSortKey(key)}
              aria-pressed={sortKey === key}
              className={`rounded-full px-3 py-1.5 text-sm border transition ${
                sortKey === key ? "font-semibold border-neutral-600 dark:border-white" : "border-neutral-300 dark:border-white/20"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
