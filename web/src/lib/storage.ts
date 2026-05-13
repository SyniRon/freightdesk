// localStorage helpers — wraps reads with safe fallback and JSON parse.

export const LS = {
  get<T>(k: string, d: T): T {
    try {
      const v = localStorage.getItem("eveship." + k);
      return v == null ? d : (JSON.parse(v) as T);
    } catch {
      return d;
    }
  },
  set<T>(k: string, v: T): void {
    try {
      localStorage.setItem("eveship." + k, JSON.stringify(v));
    } catch {
      // ignore — quota or disabled storage
    }
  },
};
