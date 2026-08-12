import { describe, expect, it } from "vitest";
import { validateService } from "../validate-service";

const WHERE = "my-shipper.yaml";

// A minimal service config in the shape the YAML loader hands the validator.
// `ratesVerified` is a fixed past date so the base can never drift into the
// not-in-the-future check. The positive case below feeds this same base through
// the validator, so a base that rots against the schema fails loudly there
// rather than quietly satisfying the rejection cases for the wrong reason.
function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    id: "my-shipper",
    name: "My Shipping Service",
    routes: [
      { origin: "cj6mt", destination: "jita44", formula: { kind: "rate-only", ratePerM3: 900 } },
    ],
    ratesVerified: "2020-01-01",
    ...overrides,
  };
}

// Every rejection names the file and the field — asserting both is what keeps a
// throw from somewhere earlier in the validator from passing for the wrong one.
function expectRejected(config: unknown) {
  let message = "";
  try {
    validateService(config, WHERE);
  } catch (e) {
    message = (e as Error).message;
  }
  expect(message).toContain(WHERE);
  expect(message).toContain("ratesVerified");
}

describe("validateService — ratesVerified", () => {
  it("rejects a config that omits the field", () => {
    const { ratesVerified, ...withoutField } = baseConfig();
    expectRejected(withoutField);
  });

  // One row per input family a contributor can actually commit. `2026-02-30` is
  // the row that reaches the calendar check itself: V8's ISO parser range-checks
  // the month but rolls the day, so it parses as a valid Date (2026-03-02) and
  // only a round-trip comparison catches it.
  it.each([
    ["text that is not a date", "soon"],
    ["a number — the dashes fat-fingered out", 20260812],
    ["a month that does not exist", "2026-13-01"],
    ["a day that does not exist in that month", "2026-02-30"],
  ])("rejects %s", (_family, value) => {
    expectRejected(baseConfig({ ratesVerified: value }));
  });

  // A mistyped year would suppress that service's badge permanently and
  // silently — the exact failure this validation exists to prevent.
  it("rejects a date in the future", () => {
    const inTwoDays = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
    expectRejected(baseConfig({ ratesVerified: inTwoDays }));
  });

  // The declared date is the only freshness signal — no git, no build clock.
  // This also proves the base config above still satisfies the schema, so the
  // rejection cases fail for the reason they claim.
  it("accepts a declared date and carries it through as the service's updated date", () => {
    const service = validateService(baseConfig({ ratesVerified: "2024-07-04" }), WHERE);
    expect(service.updated).toBe("2024-07-04");
  });
});
