import type { Config, Context } from "@netlify/functions";
import { authenticateAccount } from "./_shared/accounts";
import {
  createSessionToken,
  requireSession,
  SESSION_COOKIE_NAME,
  SessionError,
  type SessionPrincipal,
} from "./_shared/session";

const SESSION_TTL_SECONDS = 8 * 60 * 60;
const MAX_BODY_BYTES = 4_096;

interface AuthRequest {
  action?: string;
  id?: string;
  pin?: string;
}

export default async function auth(
  request: Request,
  context: Context,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "POST") {
    return json(
      { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "허용되지 않은 요청 방식입니다." } },
      405,
      { Allow: "GET, POST" },
    );
  }

  try {
    if (request.method === "GET") {
      return json({ ok: true, data: publicSession(await requireSession(context)) });
    }

    assertSameOrigin(request);
    const body = await readRequest(request);
    if (body.action === "logout") {
      return json(
        { ok: true, data: { authenticated: false } },
        200,
        { "Set-Cookie": expiredSessionCookie() },
      );
    }
    if (body.action !== "login") {
      return json(
        { ok: false, error: { code: "INVALID_ACTION", message: "지원하지 않는 인증 작업입니다." } },
        400,
      );
    }

    const submitterPin = Netlify.env.get("SUBMITTER_DEFAULT_PIN");
    const adminPin = Netlify.env.get("ADMIN_PIN");
    const signingSecret = Netlify.env.get("SESSION_SIGNING_SECRET");
    if (!submitterPin || !adminPin || !signingSecret) {
      return json(
        { ok: false, error: { code: "SERVER_NOT_CONFIGURED", message: "로그인 설정이 완료되지 않았습니다." } },
        503,
      );
    }

    const account = authenticateAccount(
      body.id,
      body.pin,
      submitterPin,
      adminPin,
    );
    if (!account) {
      return json(
        { ok: false, error: { code: "INVALID_CREDENTIALS", message: "아이디 또는 비밀번호를 확인해주세요." } },
        401,
      );
    }
    const principal: SessionPrincipal = {
      role: account.role,
      actorRef: account.actorRef,
      ...(account.libraryId ? { libraryId: account.libraryId } : {}),
      exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    };
    const token = await createSessionToken(principal, signingSecret);
    return json(
      { ok: true, data: publicSession(principal) },
      200,
      { "Set-Cookie": sessionCookie(token) },
    );
  } catch (error) {
    if (error instanceof SessionError) {
      const status = error.code === "SERVER_NOT_CONFIGURED" ? 503 : 401;
      return json(
        { ok: false, error: { code: error.code, message: error.message } },
        status,
      );
    }
    if (error instanceof AuthError) {
      return json(
        { ok: false, error: { code: error.code, message: error.message } },
        error.status,
      );
    }
    return json(
      { ok: false, error: { code: "INTERNAL_ERROR", message: "로그인 처리 중 오류가 발생했습니다." } },
      500,
    );
  }
}

export const config: Config = {
  path: "/api/auth",
  rateLimit: {
    windowLimit: 10,
    windowSize: 60,
    aggregateBy: ["ip", "domain"],
  },
};

async function readRequest(request: Request): Promise<AuthRequest> {
  if (!(request.headers.get("content-type") ?? "").includes("application/json")) {
    throw new AuthError(
      "UNSUPPORTED_MEDIA_TYPE",
      "application/json 요청만 허용됩니다.",
      415,
    );
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
    throw new AuthError("PAYLOAD_TOO_LARGE", "요청 본문이 너무 큽니다.", 413);
  }
  try {
    return JSON.parse(text) as AuthRequest;
  } catch {
    throw new AuthError("INVALID_JSON", "JSON 요청을 해석할 수 없습니다.", 400);
  }
}

function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const configuredOrigin = Netlify.env.get("APP_ORIGIN");
  const expectedOrigin = configuredOrigin || new URL(request.url).origin;
  if (!origin || origin !== expectedOrigin) {
    throw new AuthError("INVALID_ORIGIN", "허용되지 않은 요청 출처입니다.", 403);
  }
}

function publicSession(principal: SessionPrincipal) {
  return {
    authenticated: true,
    role: principal.role,
    actor_ref: principal.actorRef,
    library_id: principal.libraryId ?? null,
    expires_at: new Date(principal.exp * 1000).toISOString(),
  };
}

function sessionCookie(token: string): string {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function expiredSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...headers,
    },
  });
}

class AuthError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
