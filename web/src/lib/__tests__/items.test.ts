import { describe, expect, it, vi, beforeEach } from "vitest";
import { __setItemsForTesting, loadItems } from "../items";

describe("loadItems", () => {
  beforeEach(() => __setItemsForTesting(null));

  it("fetches /items.json on first call and caches", async () => {
    const fixture = { drake: { id: 24698, vol: 15000 } };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => fixture,
    });
    vi.stubGlobal("fetch", fetchMock);

    const a = await loadItems();
    const b = await loadItems();
    expect(a).toEqual(fixture);
    expect(b).toBe(a); // same reference
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects on non-OK response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(loadItems()).rejects.toThrow(/503/);
  });
});
