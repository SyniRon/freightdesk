import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Extra hostnames allowed to reach the dev server (Vite's DNS-rebinding
    // guard). Comma-separated, supplied at runtime so no environment-specific
    // host (e.g. a tailnet name) is committed. Unset = Vite's default.
    allowedHosts: process.env.VITE_DEV_ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean),
  },
});
