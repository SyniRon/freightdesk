import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@sentry/react", () => {
  const scope = { setTag: vi.fn(), setContext: vi.fn() };
  return {
    getClient: vi.fn(),
    withScope: vi.fn((cb: (s: typeof scope) => void) => {
      cb(scope);
      return scope;
    }),
    captureException: vi.fn(),
    __scope: scope,
  };
});

import * as Sentry from "@sentry/react";
import { captureError } from "../sentry";

const scope = (Sentry as unknown as { __scope: { setTag: ReturnType<typeof vi.fn>; setContext: ReturnType<typeof vi.fn> } }).__scope;

describe("captureError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("logs to console and no-ops Sentry when client is undefined", () => {
    (Sentry.getClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue(undefined);
    const err = new Error("boom");

    captureError("test message", err, { foo: "bar" });

    expect(console.error).toHaveBeenCalledWith("test message", err, { foo: "bar" });
    expect(Sentry.withScope).not.toHaveBeenCalled();
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it("captures exception with tag and context when client is present", () => {
    (Sentry.getClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    const err = new Error("boom");

    captureError("test message", err, { foo: "bar" });

    expect(Sentry.withScope).toHaveBeenCalledTimes(1);
    expect(scope.setTag).toHaveBeenCalledWith("message", "test message");
    expect(scope.setContext).toHaveBeenCalledWith("extra", { foo: "bar" });
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });

  it("skips setContext when extra is omitted", () => {
    (Sentry.getClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({});
    const err = new Error("boom");

    captureError("test message", err);

    expect(scope.setTag).toHaveBeenCalledWith("message", "test message");
    expect(scope.setContext).not.toHaveBeenCalled();
    expect(Sentry.captureException).toHaveBeenCalledWith(err);
  });
});
