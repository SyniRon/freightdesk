// Combobox: full-universe location search (ADR 0011). Synchronously filters the
// curated alias presets + the SDE-sourced dockable corpus loaded once on mount —
// no debounce, no network call at search time. Curated presets pin to the top
// with friendly labels; SDE dockables rank below by system relevance. Only
// dockables are selectable. Free-text that resolves to nothing flows through as
// a {custom: true} Location — the neutral, retained "no catalog rate" path.

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LOCATIONS, makeCustomLocation, type Location } from "../lib/logic";
import {
  searchLocations,
  SEARCH_CAP,
  type LocationIndex,
  type SearchResult,
} from "../lib/locations";
import { Caret, Search, X } from "./icons";
import { SecBadge } from "./SecBadge";

interface LocationComboProps {
  value: Location;
  onChange: (loc: Location) => void;
  label: string;
  /** Indexed SDE corpus; null until loaded (or on fetch failure) — the combo
   *  gracefully degrades to the curated presets. */
  locIndex: LocationIndex | null;
  /** True when the SDE corpus failed to load (distinct from still-loading): the
   *  menu says so rather than silently showing only the curated presets. */
  locUnavailable?: boolean;
}

type Item =
  | { kind: "result"; result: SearchResult }
  | { kind: "custom"; text: string };

export function LocationCombo({ value, onChange, label, locIndex, locUnavailable }: LocationComboProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hi, setHi] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // outside click → close
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const trimmed = query.trim();
  const lower = trimmed.toLowerCase();

  const { results, truncated } = useMemo(
    () => searchLocations(trimmed, locIndex, LOCATIONS),
    [trimmed, locIndex],
  );

  // Offer the custom path only when the query isn't an exact match of something
  // already selectable (preset short/name or a dockable listing string).
  const exact =
    lower.length > 0 &&
    results.some(
      (r) =>
        r.loc.short.toLowerCase() === lower ||
        r.loc.name.toLowerCase() === lower ||
        r.loc.id.toLowerCase() === lower,
    );
  const allowCustom = trimmed.length >= 2 && !exact;

  const items: Item[] = [
    ...results.map((r): Item => ({ kind: "result", result: r })),
    ...(allowCustom ? [{ kind: "custom" as const, text: trimmed }] : []),
  ];

  function commit(item: Item | undefined) {
    if (!item) return;
    if (item.kind === "result") onChange(item.result.loc);
    else onChange(makeCustomLocation(item.text));
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
  }

  function openAndFocus() {
    setOpen(true);
    setQuery("");
    setHi(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHi((h) => Math.min(items.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(items[hi]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setQuery("");
      inputRef.current?.blur();
    } else if (e.key === "Tab") {
      setOpen(false);
      setQuery("");
    }
  }

  useEffect(() => {
    setHi(0);
  }, [query]);

  const presetCount = results.filter((r) => r.preset).length;
  const headLabel = lower
    ? `${results.length} match${results.length === 1 ? "" : "es"}`
    : "Trade hubs & alliance staging";

  return (
    <div className="loc-select loc-combo" ref={wrapRef}>
      <div className="loc-label">{label}</div>
      {!open ? (
        <button className="loc-btn" onClick={openAndFocus}>
          <div className="loc-btn-main">
            <div className="loc-btn-line">
              <SecBadge sec={value.sec} />
              <span className="loc-short">{value.short}</span>
              {value.custom && <span className="tag tag-custom">custom</span>}
            </div>
            <span className="loc-full">{value.name}</span>
          </div>
          <Caret />
        </button>
      ) : (
        <div className="loc-input-wrap is-open">
          <span className="loc-input-icon">
            <Search />
          </span>
          <input
            ref={inputRef}
            className="loc-input mono"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`search system or station… (currently ${value.short})`}
            autoFocus
            spellCheck={false}
          />
          {query && (
            <button
              className="loc-input-clear"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              aria-label="Clear"
            >
              <X />
            </button>
          )}
        </div>
      )}
      {open && (
        <div className="loc-menu" ref={listRef}>
          {locUnavailable && !locIndex && (
            <div className="loc-note-warn">
              Full-universe search unavailable — showing pinned locations only.
              Type a system or station name to enter it manually.
            </div>
          )}
          {results.length > 0 && <div className="loc-menu-h">{headLabel}</div>}
          {results.map((r, i) => {
            const l = r.loc;
            return (
              <button
                key={l.id}
                className={
                  "loc-opt " + (l.id === value.id ? "is-sel " : "") + (hi === i ? "is-hi " : "")
                }
                onMouseEnter={() => setHi(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commit({ kind: "result", result: r })}
              >
                <div className="loc-opt-l">
                  <SecBadge sec={l.sec} />
                  <span className="loc-short">{l.short}</span>
                  {r.preset && l.alliance && <span className="tag tag-alliance">alliance</span>}
                  {r.preset && l.hub && <span className="tag tag-hub">trade hub</span>}
                </div>
                <span className="loc-full">{l.name}</span>
              </button>
            );
          })}
          {truncated && (
            <div className="loc-empty">
              Showing the first {SEARCH_CAP} — keep typing to narrow.
            </div>
          )}
          {allowCustom && (
            <button
              className={
                "loc-opt loc-opt-custom " + (hi === results.length ? "is-hi " : "")
              }
              onMouseEnter={() => setHi(results.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit({ kind: "custom", text: trimmed })}
            >
              <div className="loc-opt-l">
                <span className="tag tag-custom">use as typed</span>
                <span className="loc-short mono">{trimmed}</span>
              </div>
              <span className="loc-full dim">
                No catalog rate for this route — set a manual rate to price it
              </span>
            </button>
          )}
          {results.length === 0 && !allowCustom && (
            <div className="loc-empty">
              Keep typing — at least 2 characters to use as custom.
            </div>
          )}
          {lower && presetCount > 0 && results.length > presetCount && (
            <div className="loc-foot-note dim">
              Curated rates pinned first; the rest are full-universe dockables.
            </div>
          )}
          <div className="loc-foot">
            <span>
              <span className="kbd mono">↑↓</span> navigate
            </span>
            <span>
              <span className="kbd mono">↵</span> select
            </span>
            <span>
              <span className="kbd mono">esc</span> cancel
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
