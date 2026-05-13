import { useCallback, useRef, useState } from "react";

export interface ToastState {
  label: string;
  value: string;
  at: number;
}

export function useClipboard(): [ToastState | null, (value: string, label: string) => void] {
  const [toast, setToast] = useState<ToastState | null>(null);
  const tref = useRef<number | null>(null);
  const copy = useCallback((value: string, label: string) => {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(value).catch(fallback);
    } else {
      fallback();
    }
    setToast({ label, value, at: Date.now() });
    if (tref.current) window.clearTimeout(tref.current);
    tref.current = window.setTimeout(() => setToast(null), 1600);
  }, []);
  return [toast, copy];
}
