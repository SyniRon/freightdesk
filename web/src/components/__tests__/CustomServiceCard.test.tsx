import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomServiceCard } from "../CustomServiceCard";
import {
  evaluateServices,
  makeCustomService,
  makeCustomLocation,
  catalogCorpNames,
  fmtISK,
  LOCATIONS,
  type ParseResult,
  type Quote,
} from "../../lib/logic";

const jita = LOCATIONS.find((l) => l.id === "jita44")!;
const customDest = makeCustomLocation("XX-XYZ");
const parse: ParseResult = { matched: [], unmatched: [], totalVol: 10_000, totalValue: 0 };

function quote(input = { ratePerM3: 800 }): Quote {
  const svc = makeCustomService(input, jita, customDest)!;
  return evaluateServices(parse, jita, customDest, false, {}, undefined, [svc])[0];
}

function renderCard(props: Partial<React.ComponentProps<typeof CustomServiceCard>> = {}) {
  return render(
    <CustomServiceCard
      quote={props.quote ?? quote()}
      rate={props.rate ?? "800"}
      setRate={props.setRate ?? (() => {})}
      collateralPct={props.collateralPct ?? ""}
      setCollateralPct={props.setCollateralPct ?? (() => {})}
      recipient={props.recipient ?? ""}
      setRecipient={props.setRecipient ?? (() => {})}
      recipientOptions={props.recipientOptions ?? catalogCorpNames()}
    />,
  );
}

describe("CustomServiceCard", () => {
  it("is visibly distinct — carries the is-custom class and a 'your own rate' badge", () => {
    const { container } = renderCard();
    expect(container.querySelector(".service-card.is-custom")).not.toBeNull();
    expect(container.querySelector(".svc-custom-badge")?.textContent).toMatch(/your own rate/i);
  });

  it("shows the synthetic quote reward when a rate is set", () => {
    renderCard({ rate: "800", quote: quote() });
    expect(screen.getByText(new RegExp(fmtISK(10_000 * 800)))).toBeInTheDocument();
  });

  it("prompts for a rate (em-dash reward) when none is set yet", () => {
    renderCard({ rate: "", quote: undefined });
    expect(screen.getByText(/Set a per-m³ rate/i)).toBeInTheDocument();
  });

  it("calls setRate as the user types", async () => {
    const setRate = vi.fn();
    renderCard({ rate: "", quote: undefined, setRate });
    await userEvent.type(screen.getByLabelText(/Custom rate/i), "5");
    expect(setRate).toHaveBeenCalled();
  });

  it("seeds the Recipient combobox with the catalog corp names", () => {
    renderCard();
    const opts = Array.from(document.querySelectorAll("#custom-recipient-options option")).map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect(opts).toContain("ADFU Kum N Go Transport Group");
    expect(opts).toContain("Imperial Transcontinental Logistics");
  });

  it("Recipient input is empty-permitted (placeholder signals public contract)", () => {
    renderCard({ recipient: "" });
    const input = screen.getByLabelText(/Recipient/i) as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toMatch(/public|blank/i);
  });

  it("zero total volume + valid rate → NOT priced (em-dash reward, paste-cargo note)", () => {
    // Reachable when only unrecognized item names are pasted: hasParse is true
    // (unmatched lines) but totalVol === 0, so reward = 0 × rate = 0 ISK. A
    // confident 0-ISK quote must not be copyable. (CRITICAL — finding #1)
    const emptyParse: ParseResult = { matched: [], unmatched: [], totalVol: 0, totalValue: 0 };
    const svc = makeCustomService({ ratePerM3: 800 }, jita, customDest)!;
    const q = evaluateServices(emptyParse, jita, customDest, false, {}, undefined, [svc])[0];
    expect(q.reward).toBe(0);
    renderCard({ rate: "800", quote: q });
    // Reward shows the em-dash, never "0 ISK".
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/0 ISK/)).toBeNull();
    expect(screen.getByText(/paste cargo/i)).toBeInTheDocument();
  });

  it("collateral-% set but collateral unknown (0) → warns the percent is inert", () => {
    // noPriceItems / zero-priced cargo means quote.collateral === 0, so the max
    // formula silently falls back to the rate leg. Surface that. (finding #2)
    const noPriceParse: ParseResult = {
      matched: [{ key: "x", name: "X", qty: 1, vol: 10_000, price: 0, id: 1 }],
      unmatched: [],
      totalVol: 10_000,
      totalValue: 0,
      collateral: 0,
    };
    const svc = makeCustomService({ ratePerM3: 800, collateralPct: 0.5 }, jita, customDest)!;
    const q = evaluateServices(noPriceParse, jita, customDest, false, {}, undefined, [svc])[0];
    expect(q.collateral).toBe(0);
    renderCard({ rate: "800", collateralPct: "0.5", quote: q });
    expect(screen.getByText(/collateral.*(unknown|can't|cannot|no.*price|inert|priced on the rate)/i)).toBeInTheDocument();
  });

  it("no inert-collateral warning when collateral is known", () => {
    const parseWithColl: ParseResult = {
      matched: [], unmatched: [], totalVol: 10, totalValue: 0, collateral: 100_000_000_000,
    };
    const svc = makeCustomService({ ratePerM3: 800, collateralPct: 0.5 }, jita, customDest)!;
    const q = evaluateServices(parseWithColl, jita, customDest, false, {}, undefined, [svc])[0];
    renderCard({ rate: "800", collateralPct: "0.5", quote: q });
    expect(screen.queryByText(/collateral.*(unknown|inert)/i)).toBeNull();
  });
});
