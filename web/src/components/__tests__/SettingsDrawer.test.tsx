import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { SettingsDrawer, type AppSettings, COLLATERAL_PCT_MIN, COLLATERAL_PCT_MAX } from "../SettingsDrawer";

const BASE: AppSettings = {
  priceSource: "split",
  collateralPct: 120,
  defaultOrigin: "",
  defaultDest: "",
  overrideCollateral: { enabled: false, value: 0 },
  overrideVol: { enabled: false, value: 0 },
  overrideRate: { enabled: false, value: 0 },
};

// Host wires real state so we observe what the drawer commits, exactly as App does.
function Host({ initial = BASE }: { initial?: AppSettings }) {
  const [settings, setSettings] = useState<AppSettings>(initial);
  return (
    <>
      <span data-testid="pct-value">{settings.collateralPct}</span>
      <span data-testid="coll-value">{settings.overrideCollateral.value}</span>
      <span data-testid="vol-value">{settings.overrideVol.value}</span>
      <span data-testid="rate-value">{settings.overrideRate.value}</span>
      <SettingsDrawer open settings={settings} setSettings={setSettings} onClose={() => {}} />
    </>
  );
}

function collInput() {
  return screen.getByPlaceholderText("ISK") as HTMLInputElement;
}

function pctInput() {
  return screen.getByLabelText("Collateral as % of value") as HTMLInputElement;
}

describe("SettingsDrawer — collateral-% typed input (#36)", () => {
  it("accepts a fully retyped value (select-all, type 200)", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = pctInput();
    await user.tripleClick(input);
    await user.keyboard("200");
    expect(input.value).toBe("200");
    await user.tab(); // commit/normalize on blur
    expect(screen.getByTestId("pct-value").textContent).toBe("200");
  });

  it("allows the field to be emptied transiently without reverting mid-keystroke", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = pctInput();
    await user.clear(input);
    expect(input.value).toBe("");
    // typing the first digit of a new value must stick, not snap back
    await user.keyboard("1");
    expect(input.value).toBe("1");
  });

  it("clamps an out-of-range typed value up to the canonical minimum on commit", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = pctInput();
    await user.clear(input);
    await user.keyboard("1"); // below min
    await user.tab();
    expect(screen.getByTestId("pct-value").textContent).toBe(String(COLLATERAL_PCT_MIN));
    expect(input.value).toBe(String(COLLATERAL_PCT_MIN));
  });

  it("clamps an above-max typed value down to the canonical maximum on commit", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = pctInput();
    await user.clear(input);
    await user.keyboard("9999");
    await user.tab();
    expect(screen.getByTestId("pct-value").textContent).toBe(String(COLLATERAL_PCT_MAX));
  });

  it("normalizes an emptied field back to a valid value on commit", async () => {
    const user = userEvent.setup();
    render(<Host />);
    const input = pctInput();
    await user.clear(input);
    await user.tab();
    const committed = Number(screen.getByTestId("pct-value").textContent);
    expect(committed).toBeGreaterThanOrEqual(COLLATERAL_PCT_MIN);
    expect(committed).toBeLessThanOrEqual(COLLATERAL_PCT_MAX);
    expect(input.value).toBe(String(committed));
  });

  it("declares attribute min/max that agree with the code-enforced range (single source of truth)", () => {
    render(<Host />);
    const input = pctInput();
    expect(input.min).toBe(String(COLLATERAL_PCT_MIN));
    expect(input.max).toBe(String(COLLATERAL_PCT_MAX));
    expect(input.step).toBe("any");
  });
});

describe("SettingsDrawer — override shorthand inputs (#37)", () => {
  const ENABLED: AppSettings = {
    ...BASE,
    overrideCollateral: { enabled: true, value: 0 },
    overrideVol: { enabled: true, value: 0 },
    overrideRate: { enabled: true, value: 0 },
  };

  it("renders override inputs as text with a numeric inputMode (not native number)", () => {
    render(<Host initial={ENABLED} />);
    const input = collInput();
    expect(input.type).toBe("text");
    expect(input.inputMode).toBe("numeric");
  });

  it("commits shorthand 2b as 2_000_000_000 on blur and shows the normalized value", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "2b");
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("2000000000");
    // Displayed comma-formatted on blur for readability (value stays exact).
    expect(input.value).toBe("2,000,000,000");
  });

  it("displays the committed value comma-grouped on blur (readability tweak)", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "13724763"); // raw 8-digit number
    await user.tab();
    expect(input.value).toContain(",");
    expect(input.value).toBe("13,724,763");
    // Underlying committed value stays the exact integer.
    expect(screen.getByTestId("coll-value").textContent).toBe("13724763");
  });

  it("re-parses a comma-formatted display back to the same number (round-trip)", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "2b");
    await user.tab();
    expect(input.value).toBe("2,000,000,000");
    // Focus/edit again: parseShorthand strips commas, so committing the shown
    // comma string round-trips to the same value.
    await user.click(input);
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("2000000000");
    expect(input.value).toBe("2,000,000,000");
  });

  it("keeps an empty/cleared field empty (no 0 / NaN rendered)", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    expect(input.value).toBe(""); // value 0 → empty, not "0"
    await user.type(input, "abc");
    await user.tab();
    expect(input.value).toBe(""); // cleared to 0 → still empty, not "0" or "NaN"
  });

  it("commits 350k as 350_000", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "350k");
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("350000");
  });

  it("strips comma thousands separators (1,000,000)", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "1,000,000");
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("1000000");
  });

  it("commits plain digits unchanged", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "5000");
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("5000");
  });

  it("does not commit a stale/wrong number on unparseable input (clears to 0)", async () => {
    const user = userEvent.setup();
    render(<Host initial={{ ...ENABLED, overrideCollateral: { enabled: true, value: 5000 } }} />);
    const input = collInput();
    await user.clear(input);
    await user.type(input, "abc");
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("0");
  });

  it("keeps intermediate keystrokes (suffix mid-type) without snapping back", async () => {
    const user = userEvent.setup();
    render(<Host initial={ENABLED} />);
    const input = collInput();
    await user.type(input, "1.5");
    expect(input.value).toBe("1.5");
    await user.type(input, "b");
    expect(input.value).toBe("1.5b");
    await user.tab();
    expect(screen.getByTestId("coll-value").textContent).toBe("1500000000");
  });
});
