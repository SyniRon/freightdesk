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
  const svc = makeCustomService(input, jita, customDest);
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

  it("fires a REDACTED conversion event on copy — service:'custom', custom:true, no typed dest/recipient", async () => {
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
    const props = JSON.stringify(call[1]);
    expect(props).not.toContain("XX-XYZ");      // no typed destination
    expect(props).not.toContain("SomeSecretCorp"); // no recipient string
  });
});
