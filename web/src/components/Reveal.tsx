// Reveal: enter/exit animation primitive — grid-row collapse + fade.
// Used for the empty-state hero and each post-paste block. Reverse-staggered
// exit matches the entrance stagger; `prefers-reduced-motion` disables it.

import { useEffect, useRef, useState, type ReactNode } from "react";

export const REVEAL_MS = 440;
export const STAGGER_MS = 70;

type Phase = "gone" | "entering" | "in" | "leaving";

interface RevealProps {
  present: boolean;
  enterDelay?: number;
  exitDelay?: number;
  children: ReactNode;
}

export function Reveal({ present, enterDelay = 0, exitDelay = 0, children }: RevealProps) {
  const [phase, setPhase] = useState<Phase>(present ? "in" : "gone");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (present) {
      if (phase === "in" || phase === "entering") return;
      setPhase("entering");
      const t1 = window.setTimeout(() => {
        // Give the browser a frame to paint 'entering' state, then transition in.
        const t2 = window.setTimeout(() => setPhase("in"), 20);
        timers.current.push(t2);
      }, enterDelay);
      timers.current.push(t1);
    } else {
      if (phase === "gone" || phase === "leaving") return;
      const t1 = window.setTimeout(() => setPhase("leaving"), exitDelay);
      const t2 = window.setTimeout(() => setPhase("gone"), exitDelay + REVEAL_MS);
      timers.current.push(t1, t2);
    }
    return () => timers.current.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present, enterDelay, exitDelay]);

  if (phase === "gone") return null;
  return (
    <div className={"reveal reveal-" + phase}>
      <div className="reveal-inner">{children}</div>
    </div>
  );
}
