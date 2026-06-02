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
  const svc = makeCustomService(input, jita, customDest);
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
});
