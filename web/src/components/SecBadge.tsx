import { fmtSec, secTier } from "../lib/logic";

interface SecBadgeProps {
  sec: number | null | undefined;
  size?: "sm" | "lg";
}

export function SecBadge({ sec, size = "sm" }: SecBadgeProps) {
  const t = secTier(sec);
  return (
    <span
      className={"sec-badge sec-" + t.tier + " sec-" + size}
      title={t.label + " · " + fmtSec(sec)}
      style={{ color: t.color }}
    >
      <span className="sec-dot" style={{ background: t.color }} />
      <span className="sec-num mono">{fmtSec(sec)}</span>
      {size === "lg" && <span className="sec-lbl">{t.label}</span>}
    </span>
  );
}
