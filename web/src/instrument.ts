// Sentry init lives here as a module-load side effect. Imported as the
// very first import in main.tsx — guarantees Sentry is wired before any
// other module resolves, so module-load-time throws are also captured.
//
// Privacy posture (see spec §3): hangar paste content must never reach
// Sentry. beforeBreadcrumb scrubs ui.* breadcrumbs from any element
// marked data-sensitive="true". beforeSend strips request URL query
// strings as a defense-in-depth measure.

import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    // Override Sentry's recommended default — see spec §3.
    sendDefaultPii: false,

    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,

    // Do not propagate sentry-trace / baggage headers cross-origin
    // (the only outbound HTTP is to market.fuzzwork.co.uk, which has
    // nothing to do with our tracing).
    tracePropagationTargets: [],

    beforeBreadcrumb,
    beforeSend,
  });
}

function beforeBreadcrumb(
  breadcrumb: Sentry.Breadcrumb,
  hint?: Sentry.BreadcrumbHint,
): Sentry.Breadcrumb | null {
  if (breadcrumb.category === "ui.input" || breadcrumb.category === "ui.click") {
    const target = (hint?.event as Event | undefined)?.target as HTMLElement | undefined;
    if (target?.closest?.('[data-sensitive="true"]')) {
      return null;
    }
  }
  return breadcrumb;
}

function beforeSend(event: Sentry.ErrorEvent): Sentry.ErrorEvent | null {
  if (event.request?.url) {
    try {
      const u = new URL(event.request.url);
      event.request.url = `${u.origin}${u.pathname}`;
    } catch {
      // non-parsable URL — leave it alone
    }
  }
  return event;
}
