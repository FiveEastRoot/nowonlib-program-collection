import type { Context } from "@netlify/functions";

export const SESSION_COOKIE_NAME = "nowonlib_session";

export interface SessionPrincipal {
  role: "submitter" | "admin";
  actorRef: string;
  libraryId?: string;
  exp: number;
}

export class SessionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function requireSession(
  context: Context,
): Promise<SessionPrincipal> {
  const token = context.cookies.get(SESSION_COOKIE_NAME);
  if (!token) {
    throw new SessionError("SESSION_REQUIRED", "로그인이 필요합니다.");
  }
  const signingSecret = Netlify.env.get("SESSION_SIGNING_SECRET");
  if (!signingSecret) {
    throw new SessionError(
      "SERVER_NOT_CONFIGURED",
      "세션 검증 설정이 완료되지 않았습니다.",
    );
  }
  return verifySessionToken(token, signingSecret);
}

export async function verifySessionToken(
  token: string,
  signingSecret: string,
): Promise<SessionPrincipal> {
  const parts = token.split(".");
  if (parts.length !== 2) {
    throw new SessionError("INVALID_SESSION", "세션 형식이 올바르지 않습니다.");
  }
  const [encodedPayload, encodedSignature] = parts;
  if (!encodedPayload || !encodedSignature) {
    throw new SessionError("INVALID_SESSION", "세션 형식이 올바르지 않습니다.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(encodedPayload),
  );
  if (!valid) {
    throw new SessionError("INVALID_SESSION", "세션 검증에 실패했습니다.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(
      new TextDecoder().decode(decodeBase64Url(encodedPayload)),
    );
  } catch {
    throw new SessionError("INVALID_SESSION", "세션 내용을 해석할 수 없습니다.");
  }
  if (!isSessionPrincipal(parsed)) {
    throw new SessionError("INVALID_SESSION", "세션 내용이 올바르지 않습니다.");
  }
  if (parsed.exp * 1000 <= Date.now()) {
    throw new SessionError("SESSION_EXPIRED", "로그인 세션이 만료되었습니다.");
  }
  return parsed;
}

export async function createSessionToken(
  principal: SessionPrincipal,
  signingSecret: string,
): Promise<string> {
  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(principal)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );
  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function isSessionPrincipal(value: unknown): value is SessionPrincipal {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  if (session.role !== "submitter" && session.role !== "admin") return false;
  if (typeof session.actorRef !== "string" || !session.actorRef.trim()) {
    return false;
  }
  if (typeof session.exp !== "number" || !Number.isFinite(session.exp)) {
    return false;
  }
  if (
    session.role === "submitter" &&
    (typeof session.libraryId !== "string" || !session.libraryId.trim())
  ) {
    return false;
  }
  return true;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
