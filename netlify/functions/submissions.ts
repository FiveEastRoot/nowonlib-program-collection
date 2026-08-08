import type { Config, Context } from "@netlify/functions";
import {
  requireSession,
  SessionError,
  type SessionPrincipal,
} from "./_shared/session";

const MAX_BODY_BYTES = 1_000_000;
const UPSTREAM_TIMEOUT_MS = 12_000;
const SLOW_UPSTREAM_MS = 2_500;
const MUTATION_ACTIONS = new Set([
  "save_submission",
  "submit_submission",
  "append_program",
  "delete_program",
  "request_revision",
  "complete_review",
  "set_collection_status",
  "create_collection_month",
]);

interface ClientMutationRequest {
  request_id?: string;
  action?: string;
  payload?: unknown;
}

export default async function submissions(
  request: Request,
  context: Context,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return jsonResponse(
      { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "허용되지 않은 요청 방식입니다." } },
      405,
      { Allow: "GET, POST" },
    );
  }

  try {
    if (request.method === "POST") {
      assertSameOrigin(request);
    }
    const principal = await requireSession(context);
    const envelope =
      request.method === "GET"
        ? {
            request_id: `read-${context.requestId}`,
            action: "get_snapshot",
            payload: {},
          }
        : await readMutationRequest(request, context);
    if (
      ["set_collection_status", "create_collection_month"].includes(
        envelope.action,
      ) &&
      principal.role !== "admin"
    ) {
      throw new GatewayError(
        "FORBIDDEN",
        "관리자만 수합 운영을 변경할 수 있습니다.",
        403,
      );
    }

    return await callAppsScript(envelope, principal);
  } catch (error) {
    if (error instanceof SessionError) {
      const status = error.code === "SERVER_NOT_CONFIGURED" ? 503 : 401;
      return jsonResponse(
        { ok: false, error: { code: error.code, message: error.message } },
        status,
      );
    }
    if (error instanceof GatewayError) {
      return jsonResponse(
        { ok: false, error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    return jsonResponse(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "요청 처리 중 오류가 발생했습니다.",
        },
      },
      500,
    );
  }
}

export const config: Config = {
  path: "/api/submissions",
};

async function readMutationRequest(
  request: Request,
  context: Context,
): Promise<Required<ClientMutationRequest>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new GatewayError(
      "UNSUPPORTED_MEDIA_TYPE",
      "application/json 요청만 허용됩니다.",
      415,
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new GatewayError(
      "PAYLOAD_TOO_LARGE",
      "요청 본문이 허용 크기를 초과했습니다.",
      413,
    );
  }

  let body: ClientMutationRequest;
  try {
    body = JSON.parse(text) as ClientMutationRequest;
  } catch {
    throw new GatewayError("INVALID_JSON", "JSON 요청을 해석할 수 없습니다.", 400);
  }
  if (!body.action || !MUTATION_ACTIONS.has(body.action)) {
    throw new GatewayError("INVALID_ACTION", "지원하지 않는 작업입니다.", 400);
  }
  const requestId = body.request_id || `request-${context.requestId}`;
  if (
    requestId.length < 8 ||
    requestId.length > 128 ||
    !/^[A-Za-z0-9._:-]+$/.test(requestId)
  ) {
    throw new GatewayError("INVALID_REQUEST_ID", "request_id 형식이 올바르지 않습니다.", 400);
  }
  return {
    request_id: requestId,
    action: body.action,
    payload: body.payload ?? {},
  };
}

async function callAppsScript(
  envelope: Required<ClientMutationRequest>,
  principal: SessionPrincipal,
): Promise<Response> {
  const endpoint = Netlify.env.get("APPS_SCRIPT_WEB_APP_URL");
  const serviceSecret = Netlify.env.get("APPS_SCRIPT_SERVICE_SECRET");
  if (!endpoint || !serviceSecret) {
    throw new GatewayError(
      "SERVER_NOT_CONFIGURED",
      "Google Sheets 연계 설정이 완료되지 않았습니다.",
      503,
    );
  }
  assertAppsScriptUrl(endpoint);

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service_secret: serviceSecret,
        request_id: envelope.request_id,
        action: envelope.action,
        actor: {
          role: principal.role,
          actor_ref: principal.actorRef,
          ...(principal.libraryId ? { library_id: principal.libraryId } : {}),
        },
        payload: envelope.payload,
      }),
      redirect: "follow",
      signal: controller.signal,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const code =
      error instanceof DOMException && error.name === "AbortError"
        ? "UPSTREAM_TIMEOUT"
        : "UPSTREAM_UNAVAILABLE";
    logUpstreamWarning(code, envelope, contextForLog(principal), durationMs);
    throw new GatewayError(
      code,
      code === "UPSTREAM_TIMEOUT"
        ? "운영 데이터 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요."
        : "Google Sheets 저장 서비스에 연결할 수 없습니다.",
      code === "UPSTREAM_TIMEOUT" ? 504 : 502,
    );
  } finally {
    clearTimeout(timeout);
  }

  const responseText = await upstream.text();
  const durationMs = Date.now() - startedAt;
  if (durationMs >= SLOW_UPSTREAM_MS) {
    logUpstreamWarning(
      "SLOW_UPSTREAM",
      envelope,
      contextForLog(principal),
      durationMs,
      upstream.status,
    );
  }
  if (!upstream.ok) {
    logUpstreamWarning(
      "UPSTREAM_HTTP_ERROR",
      envelope,
      contextForLog(principal),
      durationMs,
      upstream.status,
    );
    throw new GatewayError(
      "UPSTREAM_HTTP_ERROR",
      "Google Sheets 저장 서비스가 요청을 처리하지 못했습니다.",
      502,
    );
  }
  let responseBody: unknown;
  try {
    responseBody = JSON.parse(responseText);
  } catch {
    throw new GatewayError(
      "INVALID_UPSTREAM_RESPONSE",
      "Google Sheets 저장 서비스 응답을 해석할 수 없습니다.",
      502,
    );
  }
  if (envelope.action === "get_snapshot") {
    responseBody = attachSessionToSnapshot(responseBody, principal);
  }
  return jsonResponse(responseBody, 200, {
    "Server-Timing": `apps-script;dur=${durationMs}`,
    "X-Request-Id": envelope.request_id,
  });
}

function attachSessionToSnapshot(
  responseBody: unknown,
  principal: SessionPrincipal,
): unknown {
  if (!responseBody || typeof responseBody !== "object") return responseBody;
  const envelope = responseBody as Record<string, unknown>;
  if (!envelope.ok || !envelope.data || typeof envelope.data !== "object") {
    return responseBody;
  }
  return {
    ...envelope,
    data: {
      ...(envelope.data as Record<string, unknown>),
      session: {
        role: principal.role,
        actor_ref: principal.actorRef,
        library_id: principal.libraryId ?? null,
        expires_at: new Date(principal.exp * 1000).toISOString(),
      },
    },
  };
}

function contextForLog(principal: SessionPrincipal): string {
  return principal.role === "admin" ? "admin" : "submitter";
}

function logUpstreamWarning(
  code: string,
  envelope: Required<ClientMutationRequest>,
  role: string,
  durationMs: number,
  upstreamStatus?: number,
): void {
  console.warn(
    JSON.stringify({
      event: "submissions_upstream_warning",
      code,
      action: envelope.action,
      role,
      duration_ms: durationMs,
      ...(typeof upstreamStatus === "number"
        ? { upstream_status: upstreamStatus }
        : {}),
    }),
  );
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = Netlify.env.get("APP_ORIGIN");
  const expectedOrigin = configuredOrigin || new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    throw new GatewayError("INVALID_ORIGIN", "허용되지 않은 요청 출처입니다.", 403);
  }
}

function assertAppsScriptUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new GatewayError(
      "SERVER_NOT_CONFIGURED",
      "Apps Script URL 설정이 올바르지 않습니다.",
      503,
    );
  }
  if (
    url.protocol !== "https:" ||
    (url.hostname !== "script.google.com" &&
      url.hostname !== "script.googleusercontent.com")
  ) {
    throw new GatewayError(
      "SERVER_NOT_CONFIGURED",
      "Apps Script URL 설정이 올바르지 않습니다.",
      503,
    );
  }
}

function jsonResponse(
  body: unknown,
  status: number,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

class GatewayError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
