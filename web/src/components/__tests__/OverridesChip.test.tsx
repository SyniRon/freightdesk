import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OverridesChip } from "../OverridesChip";
import type { AppSettings } from "../SettingsDrawer";

const BASE: AppSettings = {
  priceSource: "sell",
  collateralPct: 120,
  defaultOrigin: "jita44",
  defaultDest: "cj6mt",
  overrideCollateral: { enabled: false, value: 0 },
  overrideVol: { enabled: false, value: 0 },
  overrideRate: { enabled: false, value: 0 },
};

function withOverrides(...names: Array<"collateral" | "vol" | "rate">): AppSettings {
  const s = structuredClone(BASE);
  if (names.includes("collateral")) s.overrideCollateral = { enabled: true, value: 1_000 };
  if (names.includes("vol")) s.overrideVol = { enabled: true, value: 5_000 };
  if (names.includes("rate")) s.overrideRate = { enabled: true, value: 900 };
  return s;
}

describe("OverridesChip", () => {
  it("renders nothing when no override is enabled", () => {
    const { container } = render(
      <OverridesChip settings={BASE} setSettings={() => {}} dismissed={false} onDismiss={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("names exactly the enabled overrides", () => {
    render(
      <OverridesChip
        settings={withOverrides("collateral", "rate")}
        setSettings={() => {}}
        dismissed={false}
        onDismiss={() => {}}
      />,
    );
    const chip = screen.getByText(/Overrides active/i);
    expect(chip).toHaveTextContent("collateral");
    expect(chip).toHaveTextContent("rate");
    expect(chip).not.toHaveTextContent("volume");
  });

  it("Clear all disables every override through setSettings", async () => {
    const setSettings = vi.fn();
    render(
      <OverridesChip
        settings={withOverrides("collateral", "vol", "rate")}
        setSettings={setSettings}
        dismissed={false}
        onDismiss={() => {}}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(setSettings).toHaveBeenCalledTimes(1);
    const next = setSettings.mock.calls[0][0] as AppSettings;
    expect(next.overrideCollateral.enabled).toBe(false);
    expect(next.overrideVol.enabled).toBe(false);
    expect(next.overrideRate.enabled).toBe(false);
  });

  it("Dismiss calls onDismiss (session-only hide)", async () => {
    const onDismiss = vi.fn();
    render(
      <OverridesChip
        settings={withOverrides("rate")}
        setSettings={() => {}}
        dismissed={false}
        onDismiss={onDismiss}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing while dismissed even with overrides active", () => {
    const { container } = render(
      <OverridesChip
        settings={withOverrides("collateral")}
        setSettings={() => {}}
        dismissed={true}
        onDismiss={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
