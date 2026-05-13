// Combobox: preset dropdown for known stations, falls back to free-form
// custom entry for systems not in the preset list. Custom entries flow
// through as a Location object with custom: true — services will mark the
// route ineligible until backend search is wired up.

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LOCATIONS, makeCustomLocation, type Location } from "../lib/logic";
import { Caret, Search, X } from "./icons";
import { SecBadge } from "./SecBadge";

interface LocationComboProps {
  value: Location;
  onChange: (loc: Location) => void;
  label: string;
}

type Item =
  | { kind: "preset"; loc: Location }
  | { kind: "custom"; text: string };

export function LocationCombo({ value, onChange, label }: LocationComboProps) {
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
  const filtered = lower
    ? LOCATIONS.filter(
        (l) =>
          l.short.toLowerCase().includes(lower) ||
          l.name.toLowerCase().includes(lower) ||
          l.id.toLowerCase().includes(lower),
      )
    : LOCATIONS;
  const exact =
    lower &&
    LOCATIONS.find(
      (l) =>
        l.short.toLowerCase() === lower ||
        l.id.toLowerCase() === lower ||
        l.name.toLowerCase() === lower,
    );
  const allowCustom = trimmed.length >= 2 && !exact;
  const items: Item[] = [
    ...filtered.map((l): Item => ({ kind: "preset", loc: l })),
    ...(allowCustom ? [{ kind: "custom" as const, text: trimmed }] : []),
  ];

  function commit(item: Item | undefined) {
    if (!item) return;
    if (item.kind === "preset") onChange(item.loc);
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
          {filtered.length > 0 && (
            <div className="loc-menu-h">
              {lower
                ? `${filtered.length} preset match${filtered.length === 1 ? "" : "es"}`
                : "Trade hubs & alliance staging"}
            </div>
          )}
          {filtered.map((l, i) => (
            <button
              key={l.id}
              className={
                "loc-opt " + (l.id === value.id ? "is-sel " : "") + (hi === i ? "is-hi " : "")
              }
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit({ kind: "preset", loc: l })}
            >
              <div className="loc-opt-l">
                <SecBadge sec={l.sec} />
                <span className="loc-short">{l.short}</span>
                {l.alliance && <span className="tag tag-alliance">alliance</span>}
                {l.hub && <span className="tag tag-hub">trade hub</span>}
              </div>
              <span className="loc-full">{l.name}</span>
            </button>
          ))}
          {allowCustom && (
            <button
              className={
                "loc-opt loc-opt-custom " + (hi === filtered.length ? "is-hi " : "")
              }
              onMouseEnter={() => setHi(filtered.length)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit({ kind: "custom", text: trimmed })}
            >
              <div className="loc-opt-l">
                <span className="tag tag-custom">use as typed</span>
                <span className="loc-short mono">{trimmed}</span>
              </div>
              <span className="loc-full dim">
                No preset rate — services will mark route ineligible
              </span>
            </button>
          )}
          {filtered.length === 0 && !allowCustom && (
            <div className="loc-empty">
              Keep typing — at least 2 characters to use as custom.
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
