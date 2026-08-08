import { describe, expect, it, vi } from "vitest";
import { warmOperationalSnapshot } from "./warmSnapshot";

describe("operational snapshot warmer", () => {
  it("warms the admin snapshot without exposing the service secret", async () => {
    const fetcher = vi.fn(
      async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        action: "get_snapshot",
        actor: {
          role: "admin",
          actor_ref: "system-snapshot-warmer",
        },
        payload: {},
      });
      expect(body.service_secret).toBe("server-only-secret");
      return new Response(
        JSON.stringify({
          ok: true,
          data: { schema_version: "0.1.0" },
          meta: { cache_hit: true, duration_ms: 712 },
        }),
        { status: 200 },
      );
      },
    );
    const ticks = [1_000, 1_840];

    await expect(
      warmOperationalSnapshot({
        endpoint:
          "https://script.google.com/macros/s/test-deployment/exec",
        serviceSecret: "server-only-secret",
        fetcher,
        now: () => ticks.shift() ?? 1_840,
      }),
    ).resolves.toEqual({
      durationMs: 840,
      cacheHit: true,
      upstreamDurationMs: 712,
    });
  });

  it("rejects non-Apps-Script endpoints before making a request", async () => {
    const fetcher = vi.fn();

    await expect(
      warmOperationalSnapshot({
        endpoint: "https://example.com/macros/s/test/exec",
        serviceSecret: "server-only-secret",
        fetcher,
      }),
    ).rejects.toThrow("INVALID_APPS_SCRIPT_URL");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("fails closed when Apps Script returns a logical error", async () => {
    const fetcher = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: false,
          error: { code: "SERVICE_UNAUTHORIZED" },
        }),
        { status: 200 },
      ),
    );

    await expect(
      warmOperationalSnapshot({
        endpoint:
          "https://script.google.com/macros/s/test-deployment/exec",
        serviceSecret: "server-only-secret",
        fetcher,
      }),
    ).rejects.toThrow("SERVICE_UNAUTHORIZED");
  });
});
