// FreightDesk root.
//
// Tweak controls (accent / layout / density) from the Claude Design starter
// are dropped — production keeps the copper accent + single-column layout
// baked in. The CSS data-density/data-layout attributes are kept on the
// document element in case we surface a settings toggle later.

import { useEffect, useMemo, useState } from "react";
import { track, valueBucket, volumeBucket } from "./lib/analytics";
import { EXAMPLE_PASTE, loadItems, type ItemEntry } from "./lib/items";
import {
  evaluateServices,
  parseHangarPaste,
  recomputeWithPrices,
  resolveLocation,
  type Location,
} from "./lib/logic";
import { fetchPrices, priceFor, type PriceSource } from "./lib/pricing";
import { LS } from "./lib/storage";
import { AppHeader } from "./components/AppHeader";
import { AboutFooter } from "./components/AboutFooter";
import { ContractCopy } from "./components/ContractCopy";
import { EmptyState } from "./components/EmptyState";
import { PasteBlock } from "./components/PasteBlock";
import { ParsedSummary } from "./components/ParsedSummary";
import { Reveal, REVEAL_MS, STAGGER_MS } from "./components/Reveal";
import { RoutePicker } from "./components/RoutePicker";
import { ServicePicker } from "./components/ServicePicker";
import { SettingsDrawer, type AppSettings } from "./components/SettingsDrawer";

const DEFAULT_SETTINGS: AppSettings = {
  priceSource: "sell 5%",
  collOverride: "",
  defaultOrigin: "jita44",
  defaultDest: "cj6mt",
};

const ACCENT = "#e89149";

export default function App() {
  const [raw, setRaw] = useState<string>(() => LS.get<string>("raw", ""));
  const [origin, setOrigin] = useState<Location>(() =>
    resolveLocation(LS.get<unknown>("origin", null), "jita44"),
  );
  const [dest, setDest] = useState<Location>(() =>
    resolveLocation(LS.get<unknown>("dest", null), "cj6mt"),
  );
  const [selectedSvc, setSelectedSvc] = useState<string>(() => LS.get<string>("svc", "adfu-kum-n-go"));
  const [rushEnabled, setRushEnabled] = useState<boolean>(() => LS.get<boolean>("rush", false));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() =>
    LS.get<AppSettings>("settings", DEFAULT_SETTINGS),
  );
  const [items, setItems] = useState<Record<string, ItemEntry> | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [pricesByTypeId, setPricesByTypeId] = useState<Map<number, number>>(new Map());
  const [pricesLoading, setPricesLoading] = useState(false);

  // load items DB on mount
  useEffect(() => {
    loadItems().then(setItems).catch((e) => setItemsError(String(e)));
  }, []);

  // persist
  useEffect(() => LS.set("raw", raw), [raw]);
  useEffect(() => LS.set("origin", origin), [origin]);
  useEffect(() => LS.set("dest", dest), [dest]);
  useEffect(() => LS.set("svc", selectedSvc), [selectedSvc]);
  useEffect(() => LS.set("rush", rushEnabled), [rushEnabled]);
  useEffect(() => LS.set("settings", settings), [settings]);

  // density + layout attributes (defaults baked in; ready for settings toggle)
  useEffect(() => {
    document.documentElement.setAttribute("data-density", "regular");
    document.documentElement.setAttribute("data-layout", "single");
    document.documentElement.style.setProperty("--accent", ACCENT);
  }, []);

  const parse = useMemo(
    () => (items ? parseHangarPaste(raw, items) : { matched: [], unmatched: [], totalVol: 0, totalValue: 0 }),
    [raw, items],
  );

  // Fetch prices from Fuzzwork when matched ids or priceSource changes.
  useEffect(() => {
    if (!parse.matched.length) {
      setPricesByTypeId(new Map());
      return;
    }
    const ids = parse.matched.map((m) => m.id).filter((id): id is number => typeof id === "number" && id > 0);
    if (!ids.length) return;
    setPricesLoading(true);
    let cancelled = false;
    fetchPrices(ids)
      .then((m) => {
        if (cancelled) return;
        const src = settings.priceSource as PriceSource;
        const out = new Map<number, number>();
        for (const [id, p] of m) out.set(id, priceFor(p, src));
        setPricesByTypeId(out);
      })
      .catch(() => {
        // Pricing failure is non-fatal — leave prices at 0, reward formula
        // still works on volume.
      })
      .finally(() => { if (!cancelled) setPricesLoading(false); });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parse.matched.map((m) => m.id).join(","), settings.priceSource]);
  // Note: dep on stringified ids — using parse.matched directly would re-fire on every render since the array reference changes.

  const parsedCollOverride = (() => {
    const n = parseFloat(settings.collOverride.replace(/,/g, ""));
    return isNaN(n) || n <= 0 ? undefined : n;
  })();

  const pricedParse = useMemo(
    () => recomputeWithPrices(parse, pricesByTypeId, parsedCollOverride),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parse, pricesByTypeId, parsedCollOverride],
  );
  const quotes = useMemo(
    () => evaluateServices(pricedParse, origin, dest, rushEnabled),
    [pricedParse, origin, dest, rushEnabled],
  );
  const selectedQuote =
    quotes.find((q) => q.service.id === selectedSvc) || quotes.find((q) => q.eligible);

  // auto-select first eligible
  useEffect(() => {
    if (selectedQuote && selectedQuote.service.id !== selectedSvc) {
      setSelectedSvc(selectedQuote.service.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuote?.service.id]);

  const hasParse = pricedParse.matched.length + pricedParse.unmatched.length > 0;

  // Analytics: fire once when the user finishes typing/pasting. Debounced
  // so we don't spam events on every keystroke during paste streaming.
  useEffect(() => {
    if (!hasParse) return;
    const t = setTimeout(() => {
      track("paste-parsed", {
        volume: volumeBucket(pricedParse.totalVol),
        value: valueBucket(pricedParse.totalValue),
        matched: pricedParse.matched.length,
        unmatched: pricedParse.unmatched.length,
      });
    }, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw, hasParse]);
  // (We intentionally key only on raw — pricedParse changes when prices arrive
  // but that's not a new paste event.)

  // Analytics: fire on every route change.
  useEffect(() => {
    if (!hasParse) return;
    track("route-changed", { origin: origin.id, dest: dest.id, custom: !!origin.custom || !!dest.custom });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin.id, dest.id]);

  // Fire analytics only on explicit user clicks, not on auto-select.
  const handleSelectSvc = (id: string) => {
    track("service-selected", { service: id });
    setSelectedSvc(id);
  };

  return (
    <div className="page" data-layout="single">
      <div className="bg-grid" aria-hidden />
      <div
        className="bg-glow"
        aria-hidden
        style={{ background: `radial-gradient(60% 50% at 50% 0%, ${ACCENT}26, transparent 70%)` }}
      />

      <div className="wrap">
        <AppHeader onOpenSettings={() => setSettingsOpen(true)} />

        {/* Empty hero: enters when paste is cleared (after populated has left),
            exits immediately when first paste lands. */}
        <Reveal
          present={!hasParse}
          enterDelay={REVEAL_MS + 3 * STAGGER_MS}
          exitDelay={0}
        >
          <EmptyState onLoadExample={() => setRaw(EXAMPLE_PASTE)} />
        </Reveal>

        <main className="flow">
          <div className="col-l">
            <PasteBlock
              raw={raw}
              setRaw={setRaw}
              parse={pricedParse}
              itemsLoading={items === null && !itemsError}
              itemsError={itemsError}
              pricesLoading={pricesLoading}
              onLoadExample={() => setRaw(EXAMPLE_PASTE)}
            />
            <Reveal present={hasParse} enterDelay={REVEAL_MS} exitDelay={3 * STAGGER_MS}>
              <ParsedSummary parse={pricedParse} />
            </Reveal>
          </div>

          <div className="col-r">
            <Reveal
              present={hasParse}
              enterDelay={REVEAL_MS + STAGGER_MS}
              exitDelay={2 * STAGGER_MS}
            >
              <RoutePicker
                origin={origin}
                dest={dest}
                setOrigin={setOrigin}
                setDest={setDest}
              />
            </Reveal>
            <Reveal
              present={hasParse}
              enterDelay={REVEAL_MS + 2 * STAGGER_MS}
              exitDelay={STAGGER_MS}
            >
              <ServicePicker
                quotes={quotes}
                selectedId={selectedQuote?.service.id}
                setSelectedId={handleSelectSvc}
                rushEnabled={rushEnabled}
                setRushEnabled={setRushEnabled}
              />
            </Reveal>
            <Reveal
              present={hasParse}
              enterDelay={REVEAL_MS + 3 * STAGGER_MS}
              exitDelay={0}
            >
              <ContractCopy quote={selectedQuote} origin={origin} dest={dest} />
            </Reveal>
          </div>
        </main>

        <AboutFooter />
      </div>

      <SettingsDrawer
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        setSettings={setSettings}
      />
    </div>
  );
}
