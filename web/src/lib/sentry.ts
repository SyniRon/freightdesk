// Manual error capture for chosen hookpoints. Mirrors cavbot2's
// utils.CaptureError(msg, err, kv...) so cross-project muscle memory
// matches.
//
// No-ops the Sentry call when no client is initialized (blank DSN — dev
// mode). console.error fires regardless so dev-time errors still show.

import * as Sentry from "@sentry/react";

export function captureError(
  msg: string,
  err: unknown,
  extra?: Record<string, unknown>,
): void {
  console.error(msg, err, extra);
  if (!Sentry.getClient()) return;
  Sentry.withScope((scope) => {
    scope.setTag("message", msg);
    if (extra) scope.setContext("extra", extra);
    Sentry.captureException(err);
  });
}
