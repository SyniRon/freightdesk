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
});
