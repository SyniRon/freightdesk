import { Cog } from "./icons";

interface AppHeaderProps {
  onOpenSettings: () => void;
}

export function AppHeader({ onOpenSettings }: AppHeaderProps) {
  return (
    <header className="app-h">
      <div className="brand">
        <div className="brand-mark" aria-hidden>
          <svg
            viewBox="0 0 24 24"
            width="22"
            height="22"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="square"
          >
            <path d="M3 7l9-4 9 4-9 4-9-4z" />
            <path d="M3 12l9 4 9-4" />
            <path d="M3 17l9 4 9-4" />
          </svg>
        </div>
        <div>
          <div className="brand-name">
            FREIGHT/<span className="accent">DESK</span>
          </div>
          <div className="brand-sub mono">EVE Online shipping helper · v0.1</div>
        </div>
      </div>
      <div className="app-h-r">
        <a className="link-arrow dim" href="#about">
          How it works
        </a>
        <button className="btn-icon" onClick={onOpenSettings} aria-label="Settings">
          <Cog />
        </button>
      </div>
    </header>
  );
}
