const APPS_SCRIPT_HOST = "script.google.com";
const WARM_TIMEOUT_MS = 12_000;

interface WarmSnapshotOptions {
  endpoint: string;
  serviceSecret: string;
  fetcher?: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>;
  now?: () => number;
}

export interface WarmSnapshotResult {
  durationMs: number;
  cacheHit: boolean | null;
  upstreamDurationMs: number | null;
}

export async function warmOperationalSnapshot({
  endpoint,
  serviceSecret,
  fetcher = fetch,
  now = Date.now,
}: WarmSnapshotOptions): Promise<WarmSnapshotResult> {
  const url = new URL(endpoint);
  if (
    url.protocol !== "https:" ||
    url.hostname !== APPS_SCRIPT_HOST ||
    !url.pathname.startsWith("/macros/s/") ||
    !url.pathname.endsWith("/exec")
  ) {
    throw new Error("INVALID_APPS_SCRIPT_URL");
  }

  const startedAt = now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_secret: serviceSecret,
        request_id: `warm-admin-${startedAt}`,
        action: "get_snapshot",
        actor: {
          role: "admin",
          actor_ref: "system-snapshot-warmer",
        },
        payload: {},
      }),
      redirect: "follow",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`UPSTREAM_HTTP_${response.status}`);
  }

  const envelope = (await response.json()) as {
    ok?: boolean;
    data?: unknown;
    meta?: { cache_hit?: unknown; duration_ms?: unknown };
    error?: { code?: unknown };
  };
  if (!envelope.ok || typeof envelope.data === "undefined") {
    const code =
      typeof envelope.error?.code === "string"
        ? envelope.error.code
        : "INVALID_UPSTREAM_RESPONSE";
    throw new Error(code);
  }

  return {
    durationMs: now() - startedAt,
    cacheHit:
      typeof envelope.meta?.cache_hit === "boolean"
        ? envelope.meta.cache_hit
        : null,
    upstreamDurationMs:
      typeof envelope.meta?.duration_ms === "number"
        ? envelope.meta.duration_ms
        : null,
  };
}
