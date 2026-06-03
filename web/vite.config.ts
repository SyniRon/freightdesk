import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { sentryVitePlugin } from "@sentry/vite-plugin";

// Sentry release + source-map upload is gated on SENTRY_AUTH_TOKEN. That token
// is only present in the production release build, supplied as a BuildKit
// secret (never an image layer — the GHCR image is public; see Dockerfile and
// ADR 0014). When it's absent — PR/fork image-build, local `docker compose
// build`, plain `pnpm build` — the plugin is fully disabled and NO .map files
// are emitted, so nothing leaks and the build can't fail on a missing token.
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN;
const uploadSourceMaps = Boolean(sentryAuthToken);

export default defineConfig({
  plugins: [
    react(),
    sentryVitePlugin({
      org: "syniron",
      project: "freightdesk",
      authToken: sentryAuthToken,
      disable: !uploadSourceMaps,
      release: {
        // Matches the `release` set in instrument.ts (VITE_SENTRY_RELEASE) so
        // uploaded maps bind to the release that captured the event.
        name: process.env.VITE_SENTRY_RELEASE,
        // Associate the release with its commit for suspect-commit blaming.
        // The Docker build has no `.git`, so the SHA is passed in explicitly
        // (SENTRY_RELEASE_COMMIT = github.sha). ignoreMissing keeps the build
        // green if the previous release's commit isn't in Sentry yet.
        setCommits: process.env.SENTRY_RELEASE_COMMIT
          ? {
              repo: "SyniRon/freightdesk",
              commit: process.env.SENTRY_RELEASE_COMMIT,
              ignoreMissing: true,
            }
          : undefined,
      },
      sourcemaps: {
        // Upload the maps, then delete them before the Caddy stage copies
        // `dist` — no .map ever served from the public site.
        filesToDeleteAfterUpload: ["./dist/**/*.map"],
      },
    }),
  ],
  build: {
    // 'hidden' emits source maps without a //# sourceMappingURL comment in the
    // shipped JS — the plugin uploads them to Sentry, then deletes them. Only
    // emitted when we'll upload+delete, so an unuploaded map can never ship.
    sourcemap: uploadSourceMaps ? "hidden" : false,
  },
  server: {
    host: true,
    port: 5173,
    // Extra hostnames allowed to reach the dev server (Vite's DNS-rebinding
    // guard). Comma-separated, supplied at runtime so no environment-specific
    // host (e.g. a tailnet name) is committed. Unset = Vite's default.
    allowedHosts: process.env.VITE_DEV_ALLOWED_HOSTS?.split(",").map((h) => h.trim()).filter(Boolean),
  },
});
