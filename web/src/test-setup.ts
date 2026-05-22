import "@testing-library/jest-dom/vitest";

// Test-only localStorage polyfill. Not bundled in the production build —
// vite never resolves this file outside the vitest pipeline.
//
// Why this is needed: Node 22+ ships an experimental built-in `localStorage`
// global that resolves to `undefined` unless the process is launched with
// `--localstorage-file=<path>`. Vitest's `populateGlobal` copies window
// properties onto the test's globalThis and, because the Node global already
// exists, the copy lands as `value: undefined`, shadowing whatever DOM env
// (jsdom or happy-dom) would otherwise provide on `window.localStorage`.
// Net result: bare `localStorage` references throw inside tests.
//
// Ruled out (2026-05-22): upgrading to vitest 4.1.7, downgrading to
// jsdom 25, and swapping to happy-dom 20 all reproduce the bug. There is
// no toolchain-version fix; the polyfill stays until either vitest's
// populateGlobal learns to skip undefined source values or Node removes
// the experimental built-in. Production browsers are unaffected — the real
// `window.localStorage` is provided by the user agent, not by this file.
class MemoryStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(k: string) { return this.store.has(k) ? this.store.get(k)! : null; }
  setItem(k: string, v: string) { this.store.set(k, String(v)); }
  removeItem(k: string) { this.store.delete(k); }
  key(i: number) { return Array.from(this.store.keys())[i] ?? null; }
}
const memoryStorage = new MemoryStorage();
const storageDescriptor: PropertyDescriptor = {
  value: memoryStorage,
  writable: true,
  configurable: true,
};
Object.defineProperty(globalThis, "localStorage", storageDescriptor);
if (typeof window !== "undefined") {
  Object.defineProperty(window, "localStorage", storageDescriptor);
}
