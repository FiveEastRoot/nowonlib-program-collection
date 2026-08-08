import type { LibraryId, Role } from "../domain/types";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface RawAuthSession {
  authenticated: true;
  role: Role;
  actor_ref: string;
  library_id: string | null;
  expires_at: string;
}

export interface AuthSession {
  role: Role;
  actorRef: string;
  libraryId?: LibraryId;
  expiresAt: string;
}

export class AuthClient {
  constructor(private readonly endpoint = "/api/auth") {}

  async current(): Promise<AuthSession | null> {
    const response = await fetch(this.endpoint, {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (response.status === 401) return null;
    return this.readSession(response);
  }

  async login(id: string, pin: string): Promise<AuthSession> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", id, pin }),
    });
    return this.readSession(response);
  }

  async logout(): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    if (!response.ok) {
      const envelope = (await response.json()) as ApiEnvelope<unknown>;
      throw new AuthClientError(
        envelope.error?.code ?? "LOGOUT_FAILED",
        envelope.error?.message ?? "로그아웃하지 못했습니다.",
      );
    }
  }

  private async readSession(response: Response): Promise<AuthSession> {
    const envelope = (await response.json()) as ApiEnvelope<RawAuthSession>;
    if (!response.ok || !envelope.ok || !envelope.data) {
      throw new AuthClientError(
        envelope.error?.code ?? "AUTH_FAILED",
        envelope.error?.message ?? "로그인 정보를 확인하지 못했습니다.",
      );
    }
    return {
      role: envelope.data.role,
      actorRef: envelope.data.actor_ref,
      ...(envelope.data.library_id
        ? { libraryId: envelope.data.library_id as LibraryId }
        : {}),
      expiresAt: envelope.data.expires_at,
    };
  }
}

export class AuthClientError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
