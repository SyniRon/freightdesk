import { beforeEach, describe, expect, it } from "vitest";
import { LS } from "../storage";

describe("LS", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips objects", () => {
    LS.set("k1", { a: 1, b: "two" });
    expect(LS.get<{ a: number; b: string }>("k1", { a: 0, b: "" })).toEqual({ a: 1, b: "two" });
  });

  it("returns default when key missing", () => {
    expect(LS.get("missing", "fallback")).toBe("fallback");
  });

  it("returns default on JSON parse error", () => {
    localStorage.setItem("eveship.broken", "{not json");
    expect(LS.get("broken", "ok")).toBe("ok");
  });

  // ADR 0012: the custom-card rate persists under its OWN eveship.* key,
  // independent of the global rate override (which lives inside eveship.settings).
  // Writing one must never mutate the other.
  it("custom-card rate and the global override live under independent keys", () => {
    LS.set("settings", { overrideRate: { enabled: true, value: 700 } });
    LS.set("customRate", "800");
    // Mutating the card rate leaves the settings override untouched...
    LS.set("customRate", "1234");
    expect(LS.get<{ overrideRate: { value: number } }>("settings", { overrideRate: { value: 0 } }).overrideRate.value).toBe(700);
    // ...and mutating the settings override leaves the card rate untouched.
    LS.set("settings", { overrideRate: { enabled: true, value: 999 } });
    expect(LS.get<string>("customRate", "")).toBe("1234");
    // They occupy distinct storage slots.
    expect(localStorage.getItem("eveship.customRate")).not.toBeNull();
    expect(localStorage.getItem("eveship.settings")).not.toBeNull();
  });
});
