// FreightDesk root.
//
// Tweak controls (accent / layout / density) from the Claude Design starter
// are dropped — production keeps the copper accent + single-column layout
// baked in. The CSS data-density/data-layout attributes are kept on the
// document element in case we surface a settings toggle later.

import { useEffect, useMemo, useState } from "react";
import { track, trackPageview, valueBucket, volumeBucket } from "./lib/analytics";
import { EXAMPLE_PASTE, loadItems, type ItemEntry } from "./lib/items";
import { loadLocations, type LocationIndex } from "./lib/locations";
import {
  evaluateServices,
  parseHangarPaste,
  recomputeWithPrices,
  resolveLocation,
  type Location,
} from "./lib/logic";
import { fetchPrices, priceFor, PricingError, type PriceSource } from "./lib/pricing";
import { captureError } from "./lib/sentry";
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
  priceSource: "sell",
  collateralPct: 120,
  defaultOrigin: "jita44",
  defaultDest: "cj6mt",
  overrideCollateral: { enabled: false, value: 0 },
  overrideVol: { enabled: false, value: 0 },
  overrideRate: { enabled: false, value: 0 },
};

// Hydrate a persisted override toggle, tolerating the pre-#15 shape (absent).
function hydrateOverride(raw: any): { enabled: boolean; value: number } {
  const value = typeof raw?.value === "number" && isFinite(raw.value) && raw.value > 0 ? raw.value : 0;
  return { enabled: !!raw?.enabled && value > 0, value };
}

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
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() => {
    const raw = LS.get<any>("settings", DEFAULT_SETTINGS);
    // Migrate: old shape had "sell 5%"/"sell median"/"buy 95%" + collOverride string.
    const priceSourceMap: Record<string, AppSettings["priceSource"]> = {
      "sell 5%": "sell",
      "sell median": "split",
      "buy 95%": "buy",
    };
    return {
      priceSource: priceSourceMap[raw?.priceSource] ?? (["buy", "split", "sell"].includes(raw?.priceSource) ? raw.priceSource : DEFAULT_SETTINGS.priceSource),
      collateralPct: typeof raw?.collateralPct === "number" && raw.collateralPct > 0 ? raw.collateralPct : DEFAULT_SETTINGS.collateralPct,
      defaultOrigin: raw?.defaultOrigin ?? DEFAULT_SETTINGS.defaultOrigin,
      defaultDest: raw?.defaultDest ?? DEFAULT_SETTINGS.defaultDest,
      overrideCollateral: hydrateOverride(raw?.overrideCollateral),
      overrideVol: hydrateOverride(raw?.overrideVol),
      overrideRate: hydrateOverride(raw?.overrideRate),
    };
  });
  const [items, setItems] = useState<Record<string, ItemEntry> | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  // SDE-sourced location corpus (ADR 0011). null = loading or unreachable; the
  // combo degrades gracefully to the curated presets either way.
  const [locIndex, setLocIndex] = useState<LocationIndex | null>(null);
  const [pricesByTypeId, setPricesByTypeId] = useState<Map<number, number>>(new Map());
  const [pricesLoading, setPricesLoading] = useState(false);
  const [pricesError, setPricesError] = useState<"rate-limited" | "server-error" | "network" | null>(null);

  // load items DB on mount
  useEffect(() => {
    loadItems().then(setItems).catch((e) => setItemsError(String(e)));
  }, []);

  // load the location corpus on mount (off the first-paint path). A failure is
  // non-fatal: the combo falls back to the curated presets.
  useEffect(() => {
    loadLocations()
      .then(setLocIndex)
      .catch((e) => captureError("loadLocations failed", e));
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
      setPricesError(null);
      return;
    }
    const ids = parse.matched.map((m) => m.id).filter((id): id is number => typeof id === "number" && id > 0);
    if (!ids.length) return;

    const controller = new AbortController();
    let cancelled = false;

    // Debounce: 400ms after the dep change settles
    const debounceTimer = setTimeout(() => {
      setPricesLoading(true);
      setPricesError(null);
      fetchPrices(ids, controller.signal)
        .then((m) => {
          if (cancelled) return;
          const src = settings.priceSource as PriceSource;
          const out = new Map<number, number>();
          for (const [id, p] of m) out.set(id, priceFor(p, src));
          setPricesByTypeId(out);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          if ((e as { name?: string })?.name === "AbortError") return;
          if (e instanceof PricingError) {
            setPricesError(e.kind);
            // Skip rate-limited — 429 is an expected upstream state and the
            // UI surfaces it via the toast. server-error + network are real
            // problems worth a Sentry event.
            if (e.kind !== "rate-limited") {
              captureError("pricing fetch failed", e, { kind: e.kind, idCount: ids.length });
            }
          } else {
            setPricesError("network");
            captureError("pricing fetch failed (unknown)", e, { idCount: ids.length });
          }
        })
        .finally(() => { if (!cancelled) setPricesLoading(false); });
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      controller.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parse.matched.map((m) => m.id).join(","), settings.priceSource]);
  // Note: dep on stringified ids — using parse.matched directly would re-fire on every render since the array reference changes.

  const pricedParse = useMemo(
    () => recomputeWithPrices(parse, pricesByTypeId, settings.collateralPct),
    [parse, pricesByTypeId, settings.collateralPct],
  );
  const overrides = useMemo(() => ({
    collateral: settings.overrideCollateral.enabled ? settings.overrideCollateral.value : undefined,
    vol: settings.overrideVol.enabled ? settings.overrideVol.value : undefined,
    ratePerM3: settings.overrideRate.enabled ? settings.overrideRate.value : undefined,
  }), [settings.overrideCollateral, settings.overrideVol, settings.overrideRate]);
  const quotes = useMemo(
    () => evaluateServices(pricedParse, origin, dest, rushEnabled, overrides, locIndex?.sdeIdToSlug),
    [pricedParse, origin, dest, rushEnabled, overrides, locIndex],
  );
  const selectedQuote =
    quotes.find((q) => q.service.id === selectedSvc) ||
    quotes.find((q) => q.status === "eligible") ||
    quotes.find((q) => q.status === "splittable");

  // auto-select first eligible
  useEffect(() => {
    if (selectedQuote && selectedQuote.service.id !== selectedSvc) {
      setSelectedSvc(selectedQuote.service.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuote?.service.id]);

  const contractWarnings = useMemo(() => ({
    unmatched: pricedParse.unmatched.length,
    noPriceItems: pricedParse.matched.filter((m) => m.price === 0).length,
  }), [pricedParse]);

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

  // Analytics: fire on every route change. The custom event carries property
  // data for funnel analysis; the virtual pageview is what bounce-rate metrics
  // count, so multi-route sessions stop reading as 1-pageview bounces.
  useEffect(() => {
    if (!hasParse) return;
    track("route-changed", { origin: origin.id, dest: dest.id, custom: !!origin.custom || !!dest.custom });
    trackPageview(`/route/${origin.id}/${dest.id}`);
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
        <AppHeader
          onOpenSettings={() => setSettingsOpen(true)}
          onHowItWorksClick={() => setHowItWorksOpen(true)}
        />

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
              pricesError={pricesError}
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
                locIndex={locIndex}
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
              <ContractCopy quote={selectedQuote} origin={origin} dest={dest} warnings={contractWarnings} />
            </Reveal>
          </div>
        </main>

        <AboutFooter
          open={howItWorksOpen}
          onToggle={() => setHowItWorksOpen((o) => !o)}
        />
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
