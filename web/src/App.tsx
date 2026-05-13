// FreightDesk root.
//
// Tweak controls (accent / layout / density) from the Claude Design starter
// are dropped — production keeps the copper accent + single-column layout
// baked in. The CSS data-density/data-layout attributes are kept on the
// document element in case we surface a settings toggle later.

import { useEffect, useMemo, useState } from "react";
import { EXAMPLE_PASTE } from "./lib/itemsDb";
import {
  evaluateServices,
  parseHangarPaste,
  resolveLocation,
  type Location,
} from "./lib/logic";
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
  defaultDest: "cjm6t",
};

const ACCENT = "#e89149";

export default function App() {
  const [raw, setRaw] = useState<string>(() => LS.get<string>("raw", ""));
  const [origin, setOrigin] = useState<Location>(() =>
    resolveLocation(LS.get<unknown>("origin", null), "jita44"),
  );
  const [dest, setDest] = useState<Location>(() =>
    resolveLocation(LS.get<unknown>("dest", null), "cjm6t"),
  );
  const [selectedSvc, setSelectedSvc] = useState<string>(() => LS.get<string>("svc", "adfu-kum-n-go"));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>(() =>
    LS.get<AppSettings>("settings", DEFAULT_SETTINGS),
  );

  // persist
  useEffect(() => LS.set("raw", raw), [raw]);
  useEffect(() => LS.set("origin", origin), [origin]);
  useEffect(() => LS.set("dest", dest), [dest]);
  useEffect(() => LS.set("svc", selectedSvc), [selectedSvc]);
  useEffect(() => LS.set("settings", settings), [settings]);

  // density + layout attributes (defaults baked in; ready for settings toggle)
  useEffect(() => {
    document.documentElement.setAttribute("data-density", "regular");
    document.documentElement.setAttribute("data-layout", "single");
    document.documentElement.style.setProperty("--accent", ACCENT);
  }, []);

  const parse = useMemo(() => parseHangarPaste(raw), [raw]);
  const quotes = useMemo(() => evaluateServices(parse, origin, dest), [parse, origin, dest]);
  const selectedQuote =
    quotes.find((q) => q.service.id === selectedSvc) || quotes.find((q) => q.eligible);

  // auto-select first eligible
  useEffect(() => {
    if (selectedQuote && selectedQuote.service.id !== selectedSvc) {
      setSelectedSvc(selectedQuote.service.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuote?.service.id]);

  const hasParse = parse.matched.length + parse.unmatched.length > 0;

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
              parse={parse}
              onLoadExample={() => setRaw(EXAMPLE_PASTE)}
            />
            <Reveal present={hasParse} enterDelay={REVEAL_MS} exitDelay={3 * STAGGER_MS}>
              <ParsedSummary parse={parse} />
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
                setSelectedId={setSelectedSvc}
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
