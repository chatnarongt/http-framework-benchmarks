"use client";

import { useRef, useState } from "react";
import { extractRepoName } from "@/lib/engine/types";
import { X } from "lucide-react";

export interface KnownRepo {
  id: string;
  repoUrl: string;
  database: string;
}

interface RepoComboboxProps {
  value: string;
  suggestions: KnownRepo[];
  onChange: (url: string) => void;
  /** Blur commit for free-typed URLs (register as suggestion). */
  onCommit: (url: string) => void;
  /** Suggestion picked: parent receives the remembered database too. */
  onSelect: (url: string, database: string) => void;
  onDelete: (id: string) => void;
}

export function RepoCombobox({
  value,
  suggestions,
  onChange,
  onCommit,
  onSelect,
  onDelete,
}: RepoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const dirtyRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = value.trim().toLowerCase();
  const filtered = suggestions.filter(
    (s) =>
      !q ||
      s.repoUrl.toLowerCase().includes(q) ||
      extractRepoName(s.repoUrl).toLowerCase().includes(q)
  );

  const close = () => {
    setOpen(false);
    setHighlight(0);
  };

  const pick = (s: KnownRepo) => {
    dirtyRef.current = false;
    onSelect(s.repoUrl, s.database);
    close();
    inputRef.current?.blur();
  };

  const handleBlur = () => {
    close();
    const url = value.trim();
    if (dirtyRef.current && url) {
      dirtyRef.current = false;
      onCommit(url);
    }
  };

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          dirtyRef.current = true;
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => {
          setOpen(true);
          setHighlight(0);
        }}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            close();
            return;
          }
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, Math.max(filtered.length - 1, 0)));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
            return;
          }
          if (e.key === "Enter" && open && filtered.length > 0) {
            e.preventDefault();
            pick(filtered[Math.min(highlight, filtered.length - 1)]);
          }
        }}
        className="w-full h-9 bg-slate-950 border border-slate-700 rounded-lg px-3 text-slate-100 text-sm focus:outline-none focus:border-sky-500 font-mono"
        placeholder="https://github.com/..."
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute z-20 mt-1 w-full max-h-56 overflow-auto bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-2"
        >
          {filtered.map((s, i) => (
            <li
              key={s.id}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setHighlight(i)}
              className={`flex items-center gap-2 px-3 py-2 cursor-pointer ${i === highlight ? "bg-sky-950 ring-1 ring-inset ring-sky-500" : "hover:bg-slate-800/30"
                }`}
            >
              <div className="flex-1 min-w-0">
                <div className="text-xs text-slate-200 font-semibold truncate">
                  {extractRepoName(s.repoUrl)}
                </div>
                <div className="text-xs text-slate-500 font-mono truncate">{s.repoUrl}</div>
              </div>
              <button
                type="button"
                title="Forget saved repository"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(s.id);
                }}
                className="p-1 text-slate-500 hover:text-white rounded shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
