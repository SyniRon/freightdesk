import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContractCopy } from "../ContractCopy";
import {
  evaluateServices,
  makeCustomService,
  makeCustomLocation,
  LOCATIONS,
  type ParseResult,
  type Quote,
} from "../../lib/logic";
import * as analytics from "../../lib/analytics";

const jita = LOCATIONS.find((l) => l.id === "jita44")!;
const cj6mt = LOCATIONS.find((l) => l.id === "cj6mt")!;
const customDest = makeCustomLocation("XX-XYZ");

const parse: ParseResult = {
  matched: [],
  unmatched: [],
  totalVol: 10_000,
  totalValue: 500_000_000,
  collateral: 500_000_000,
};

function catalogQuote(): Quote {
  return evaluateServices(parse, cj6mt, jita).find((q) => q.status === "eligible")!;
}

function customQuote(input = { ratePerM3: 800 }): Quote {
  const svc = makeCustomService(input, jita, customDest)!;
  return evaluateServices(parse, jita, customDest, false, {}, undefined, [svc])[0];
}

const noWarnings = { unmatched: 0, noPriceItems: 0 };

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("ContractCopy — catalog service (unchanged)", () => {
  it("renders the Shipper row with the service name", () => {
    const q = catalogQuote();
    render(<ContractCopy quote={q} origin={cj6mt} dest={jita} warnings={noWarnings} />);
    const shipper = screen.getByText("Shipper").closest(".copy-row") as HTMLElement;
    expect(within(shipper).getByText(q.service.name)).toBeInTheDocument();
  });

  it("fires a full conversion event on copy (service id + route)", async () => {
    const track = vi.spyOn(analytics, "track");
    render(<ContractCopy quote={catalogQuote()} origin={cj6mt} dest={jita} warnings={noWarnings} />);
    await userEvent.click(screen.getByText("Destination").closest(".copy-row")!);
    expect(track).toHaveBeenCalledWith("copy", expect.objectContaining({
      service: expect.not.stringMatching(/^custom$/),
      route: "cj6mt->jita44",
    }));
  });
});

describe("ContractCopy — custom service Recipient (ADR 0012)", () => {
  it("fills the Shipper row with the recipient string when one is given", () => {
    render(
      <ContractCopy
        quote={customQuote()}
        origin={jita}
        dest={customDest}
        warnings={noWarnings}
        recipient="ADFU Kum N Go Transport Group"
      />,
    );
    const shipper = screen.getByText("Shipper").closest(".copy-row") as HTMLElement;
    expect(within(shipper).getByText("ADFU Kum N Go Transport Group")).toBeInTheDocument();
  });

  it("omits the Shipper row entirely when recipient is empty (public contract)", () => {
    render(
      <ContractCopy quote={customQuote()} origin={jita} dest={customDest} warnings={noWarnings} recipient="" />,
    );
    expect(screen.queryByText("Shipper")).toBeNull();
    // Shows a neutral public-contract hint instead.
    expect(screen.getByText(/public contract/i)).toBeInTheDocument();
    // Only 3 copy rows (Destination, Reward, Collateral) — no empty Shipper string.
    expect(document.querySelectorAll(".copy-row")).toHaveLength(3);
  });

  it("never copies the custom service name as a Shipper string", () => {
    render(
      <ContractCopy quote={customQuote()} origin={jita} dest={customDest} warnings={noWarnings} recipient="" />,
    );
    expect(screen.queryByText("Custom service")).toBeNull();
  });

  it("fires a REDACTED conversion event on copy — service:'custom', custom:true, no route/dest/recipient", async () => {
    const track = vi.spyOn(analytics, "track");
    render(
      <ContractCopy
        quote={customQuote()}
        origin={jita}
        dest={customDest}
        warnings={noWarnings}
        recipient="SomeSecretCorp"
      />,
    );
    await userEvent.click(screen.getByText("Reward").closest(".copy-row")!);
    expect(track).toHaveBeenCalledWith("copy", expect.objectContaining({ service: "custom", custom: true }));
    const call = track.mock.calls.find((c) => c[0] === "copy")!;
    // No `route` property at all — the redacted payload must never carry the
    // origin->destination string for a custom route (finding #5).
    expect(call[1]).not.toHaveProperty("route");
    // Case-insensitive: the typed destination's lowercased id must be absent.
    const props = JSON.stringify(call[1]).toLowerCase();
    expect(props).not.toContain(customDest.id.toLowerCase()); // "custom:xx-xyz"
    expect(props).not.toContain("xx-xyz");                    // typed destination, any case
    expect(props).not.toContain("somesecretcorp");            // recipient string
  });

  it("ceils a fractional custom reward in the Reward row (kumgo parity — finding #3)", () => {
    // rate 0.011 × 10 m³ = 0.11 ISK raw → must render Math.ceil = 1.
    const fractionalParse: ParseResult = {
      matched: [], unmatched: [], totalVol: 10, totalValue: 0, collateral: 0,
    };
    const svc = makeCustomService({ ratePerM3: 0.011 }, jita, customDest)!;
    const q = evaluateServices(fractionalParse, jita, customDest, false, {}, undefined, [svc])[0];
    expect(q.reward).toBeCloseTo(0.11, 5);   // raw reward is fractional
    render(<ContractCopy quote={q} origin={jita} dest={customDest} warnings={noWarnings} recipient="" />);
    const reward = screen.getByText("Reward").closest(".copy-row") as HTMLElement;
    expect(within(reward).getByText("1")).toBeInTheDocument();      // ceil(0.11) = 1
    expect(within(reward).queryByText("0")).toBeNull();             // never the floor/0
  });
});
