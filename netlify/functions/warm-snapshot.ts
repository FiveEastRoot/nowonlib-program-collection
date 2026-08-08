import type { Config } from "@netlify/functions";
import { warmOperationalSnapshot } from "./_shared/warmSnapshot";

export default async function warmSnapshot(): Promise<Response> {
  const endpoint = Netlify.env.get("APPS_SCRIPT_WEB_APP_URL");
  const serviceSecret = Netlify.env.get("APPS_SCRIPT_SERVICE_SECRET");
  if (!endpoint || !serviceSecret) {
    console.error(
      JSON.stringify({
        event: "snapshot_warm_failed",
        code: "SERVER_NOT_CONFIGURED",
      }),
    );
    return new Response(null, { status: 503 });
  }

  try {
    const result = await warmOperationalSnapshot({
      endpoint,
      serviceSecret,
    });
    console.log(
      JSON.stringify({
        event: "snapshot_warm_completed",
        duration_ms: result.durationMs,
        cache_hit: result.cacheHit,
        upstream_duration_ms: result.upstreamDurationMs,
      }),
    );
    return new Response(null, { status: 204 });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "snapshot_warm_failed",
        code: error instanceof Error ? error.message : "UNKNOWN_ERROR",
      }),
    );
    return new Response(null, { status: 502 });
  }
}

export const config: Config = {
  schedule: "*/4 * * * *",
};
