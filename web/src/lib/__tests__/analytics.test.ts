import { describe, expect, it, vi, beforeEach } from "vitest";
import { track, trackPageview, valueBucket, volumeBucket } from "../analytics";

describe("volumeBucket", () => {
  it("classifies common volumes", () => {
    expect(volumeBucket(0)).toBe("empty");
    expect(volumeBucket(500)).toBe("<1k");
    expect(volumeBucket(5_000)).toBe("1k-10k");
    expect(volumeBucket(30_000)).toBe("10k-50k");
    expect(volumeBucket(80_000)).toBe("50k-100k");
    expect(volumeBucket(200_000)).toBe("100k-360k");
    expect(volumeBucket(500_000)).toBe("over-cap");
  });
});

describe("valueBucket", () => {
  it("classifies common values", () => {
    expect(valueBucket(0)).toBe("0");
    expect(valueBucket(50_000_000)).toBe("<100M");
    expect(valueBucket(500_000_000)).toBe("100M-1B");
    expect(valueBucket(5_000_000_000)).toBe("1B-10B");
    expect(valueBucket(50_000_000_000)).toBe("10B+");
  });
});

describe("track", () => {
  beforeEach(() => {
    (window as any).umami = undefined;
  });

  it("no-ops when window.umami is absent", () => {
    expect(() => track("foo")).not.toThrow();
  });

  it("forwards to umami.track when present", () => {
    const fn = vi.fn();
    (window as any).umami = { track: fn };
    track("foo", { x: 1 });
    expect(fn).toHaveBeenCalledWith("foo", { x: 1 });
  });
});

describe("trackPageview", () => {
  beforeEach(() => {
    (window as any).umami = undefined;
  });

  it("no-ops when window.umami is absent", () => {
    expect(() => trackPageview("/route/A/B")).not.toThrow();
  });

  it("calls umami.track with a function that overrides url", () => {
    const fn = vi.fn();
    (window as any).umami = { track: fn };
    trackPageview("/route/A/B");
    expect(fn).toHaveBeenCalledTimes(1);
    const arg = fn.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>;
    expect(typeof arg).toBe("function");
    expect(arg({ url: "/", title: "old", referrer: "x" })).toEqual({
      url: "/route/A/B",
      title: "old",
      referrer: "x",
    });
  });

  it("overrides title when provided", () => {
    const fn = vi.fn();
    (window as any).umami = { track: fn };
    trackPageview("/route/A/B", "Route A → B");
    const arg = fn.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>;
    expect(arg({ url: "/", title: "old" })).toEqual({
      url: "/route/A/B",
      title: "Route A → B",
    });
  });

  it("does not include title in override when omitted", () => {
    const fn = vi.fn();
    (window as any).umami = { track: fn };
    trackPageview("/route/A/B");
    const arg = fn.mock.calls[0][0] as (p: Record<string, unknown>) => Record<string, unknown>;
    const out = arg({ url: "/", title: "preserved" });
    expect(out).toEqual({ url: "/route/A/B", title: "preserved" });
  });
});
