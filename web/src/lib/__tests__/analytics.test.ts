import { describe, expect, it, vi, beforeEach } from "vitest";
import { track, valueBucket, volumeBucket } from "../analytics";

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
