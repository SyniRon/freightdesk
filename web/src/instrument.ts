// Sentry init lives here as a module-load side effect. Imported as the
// very first import in main.tsx — guarantees Sentry is wired before any
// other module resolves, so module-load-time throws are also captured.
//
// Privacy posture (ADR 0007): hangar paste content must never reach
// Sentry. dataCollection keeps every category off that Sentry 10 kept off,
// and drops URL query strings from spans. beforeBreadcrumb scrubs ui.*
// breadcrumbs from any element marked data-sensitive="true" and cuts
// fetch/xhr URLs at `?`. beforeSend strips the event's request URL query.
// e2e/sentry-privacy.spec.ts checks all of it against the real envelopes.

import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

// The deny list Sentry's v11 migration guide gives for keeping what Sentry
// 10 sent with sendDefaultPii off: User-Agent and Referer stay, IP-bearing
// headers go.
const HEADER_DENY_LIST = { deny: ["forwarded", "-ip", "remote-", "via", "-user"] };

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENV ?? import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,

    // Sentry 11 turns on any category left unset, so every category Sentry
    // 10 kept off is listed. stackFrameVariables and frameContextLines keep
    // defaults Sentry 10 shared, and the browser SDK uses neither.
    dataCollection: {
      // Off, so Sentry never infers the visitor's IP from the request.
      userInfo: false,
      cookies: false,
      httpHeaders: { request: HEADER_DENY_LIST, response: HEADER_DENY_LIST },
      httpBodies: [],
      // Stricter than Sentry 10. Span URLs lose their query string, so the
      // Fuzzwork `?types=` list (the cargo) stays out of traces. This is the
      // only span scrubber on purpose: a beforeSendSpan on top would let
      // either be deleted without the privacy suite noticing.
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
    },

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
  // Fetch/xhr breadcrumbs include the full URL including query string.
  // The Fuzzwork pricing call carries hangar type IDs in `?types=...`,
  // which would leak hangar contents. Truncate at `?` so only the
  // origin + path survive.
  if (breadcrumb.category === "fetch" || breadcrumb.category === "xhr") {
    const url = breadcrumb.data?.url;
    if (typeof url === "string") {
      const q = url.indexOf("?");
      if (q !== -1) breadcrumb.data!.url = url.slice(0, q);
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
