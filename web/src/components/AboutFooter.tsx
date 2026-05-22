import { useState } from "react";
import { Arrow, Caret, Check, Copy } from "./icons";
import { track } from "../lib/analytics";

interface AboutFooterProps {
  open: boolean;
  onToggle: () => void;
}

export function AboutFooter({ open, onToggle }: AboutFooterProps) {
  const [thanks, setThanks] = useState(false);
  // STUB: real ISK destination (corp or character) to be filled in pre-launch.
  const ISK_ADDRESS = "Delve Time Unit Expenditures";
  return (
    <footer className="app-foot" id="about">
      <button className="about-toggle" onClick={onToggle}>
        How it works <Caret style={{ transform: open ? "rotate(180deg)" : "" }} />
      </button>
      {open && (
        <div className="about-body">
          <p>
            FreightDesk is an open-source, third-party shipping calculator for capsuleers. Paste a
            hangar list, pick a route, and get the four strings you drop into EVE's Create Contract
            window. <strong>Your hangar list never touches a server</strong> — parsing happens
            entirely in your browser. Price estimates are pulled from public market endpoints; only
            the type IDs are sent.
          </p>
          <p className="dim">
            Service rates live in versioned config files. Each card shows the date the rate was
            last edited (read from commit metadata). Couriers older than 30 days get a stale
            warning.
          </p>
          <div className="foot-row">
            <a
              className="link-arrow"
              href="https://github.com/SyniRon/freightdesk"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub repository <Arrow />
            </a>
            <span className="sep">·</span>
            <a
              className="link-arrow"
              href="https://github.com/SyniRon/freightdesk/tree/main/web/services"
              target="_blank"
              rel="noopener noreferrer"
            >
              Submit a service (PR)
              <Arrow />
            </a>
            <span className="sep">·</span>
            <a
              className="link-arrow"
              href="https://developers.eveonline.com/license-agreement"
              target="_blank"
              rel="noopener noreferrer"
            >
              EVE third-party policy <Arrow />
            </a>
          </div>
        </div>
      )}
      <div className="donate">
        <div>
          <div className="donate-k">Tip jar</div>
          <div className="donate-d">If FreightDesk saved you contract math, send ISK in-game.</div>
        </div>
        <button
          className={"donate-btn mono " + (thanks ? "is-thanks" : "")}
          onClick={() => {
            navigator.clipboard?.writeText(ISK_ADDRESS);
            track("tip-copy");
            setThanks(true);
            setTimeout(() => setThanks(false), 1800);
          }}
        >
          {thanks ? (
            <>
              <Check /> Thanks
            </>
          ) : (
            <>
              <Copy /> {ISK_ADDRESS}
            </>
          )}
        </button>
      </div>
      <div className="legal">
        <span>
          FreightDesk is not affiliated with CCP Games. EVE Online and all related logos are
          trademarks of CCP hf.
        </span>
      </div>
    </footer>
  );
}
