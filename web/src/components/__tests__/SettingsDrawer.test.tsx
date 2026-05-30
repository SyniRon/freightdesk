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
      <SettingsDrawer open settings={settings} setSettings={setSettings} onClose={() => {}} />
    </>
  );
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
