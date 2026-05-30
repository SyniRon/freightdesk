import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ServicePicker } from "../ServicePicker";
import { evaluateServices, LOCATIONS, type ParseResult, type Quote } from "../../lib/logic";

const cj6mt = LOCATIONS.find((l) => l.id === "cj6mt")!;
const jita = LOCATIONS.find((l) => l.id === "jita44")!;

// A real, eligible cj6mt → jita load (a `max` route @900/m³ vs 0.5% collateral).
const base: ParseResult = {
  matched: [],
  unmatched: [],
  totalVol: 10_000,
  totalValue: 500_000_000,
  collateral: 600_000_000,
};

function quotesFor(overrides = {}): Quote[] {
  return evaluateServices(base, cj6mt, jita, false, overrides);
}

function renderPicker(quotes: Quote[]) {
  return render(
    <ServicePicker
      quotes={quotes}
      selectedId={quotes[0]?.service.id}
      setSelectedId={() => {}}
      rushEnabled={false}
      setRushEnabled={() => {}}
    />,
  );
}

// The card surface for the first (ADFU) service.
function firstCard(): HTMLElement {
  const name = screen.getAllByText("ADFU Kum N Go Transport Group")[0];
  return name.closest(".service-card") as HTMLElement;
}

describe("ServicePicker override annotations", () => {
  it("with no overrides, no card line carries an override tag", () => {
    renderPicker(quotesFor());
    const card = firstCard();
    expect(within(card).queryByText("override")).toBeNull();
    // No struck-through market figure either.
    expect(card.querySelector(".svc-struck")).toBeNull();
  });

  it("a collateral override strikes the market collateral and tags the line", () => {
    renderPicker(quotesFor({ collateral: 100_000_000_000 }));
    const card = firstCard();
    const collCell = within(card).getByText("Collateral").closest(".svc-cell") as HTMLElement;
    // market collateral (600M) struck through, override (100B) shown live.
    const struck = within(collCell).getByText(/600\.00M/);
    expect(struck).toHaveClass("svc-struck");
    expect(within(collCell).getByText(/100\.00B/)).toBeInTheDocument();
    expect(within(collCell).getByText("override")).toBeInTheDocument();
  });

  it("a volume override annotates the reward line (the card-face value it drives)", () => {
    renderPicker(quotesFor({ vol: 50_000 }));
    const card = firstCard();
    const reward = card.querySelector(".svc-reward") as HTMLElement;
    // market volume struck, override volume shown, override tag present.
    const struck = within(reward).getByText(/10,000 m³/);
    expect(struck).toHaveClass("svc-struck");
    expect(within(reward).getByText(/50,000 m³/)).toBeInTheDocument();
    expect(within(reward).getByText("override")).toBeInTheDocument();
    // Collateral + rate lines untouched.
    const collCell = within(card).getByText("Collateral").closest(".svc-cell") as HTMLElement;
    expect(within(collCell).queryByText("override")).toBeNull();
    const rateCell = within(card).getByText("Rate").closest(".svc-cell") as HTMLElement;
    expect(within(rateCell).queryByText("override")).toBeNull();
  });

  it("a rate override strikes the market rate and tags the rate line only", () => {
    renderPicker(quotesFor({ ratePerM3: 1_234 }));
    const card = firstCard();
    const rateCell = within(card).getByText("Rate").closest(".svc-cell") as HTMLElement;
    const struck = within(rateCell).getByText(/900 \/ m³/);
    expect(struck).toHaveClass("svc-struck");
    expect(within(rateCell).getByText(/1234 \/ m³/)).toBeInTheDocument();
    expect(within(rateCell).getByText("override")).toBeInTheDocument();
    // Collateral line is untouched.
    const collCell = within(card).getByText("Collateral").closest(".svc-cell") as HTMLElement;
    expect(within(collCell).queryByText("override")).toBeNull();
    expect(collCell.querySelector(".svc-struck")).toBeNull();
  });
});
