import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

async function signSession(
  payload: Record<string, unknown>,
  secret = "test-session-signing-secret",
): Promise<string> {
  const encodedPayload = encodeBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

describe("Netlify session verification", () => {
  it("creates a token that can be verified", async () => {
    const principal = {
      role: "submitter" as const,
      actorRef: "account-wolgae",
      libraryId: "wolgae",
      exp: Math.floor(Date.now() / 1000) + 60,
    };
    const token = await createSessionToken(
      principal,
      "test-session-signing-secret",
    );

    await expect(
      verifySessionToken(token, "test-session-signing-secret"),
    ).resolves.toEqual(principal);
  });

  it("accepts a valid signed submitter session", async () => {
    const token = await signSession({
      role: "submitter",
      actorRef: "account-nowon-central",
      libraryId: "nowon-central",
      exp: Math.floor(Date.now() / 1000) + 60,
    });

    await expect(
      verifySessionToken(token, "test-session-signing-secret"),
    ).resolves.toMatchObject({
      role: "submitter",
      actorRef: "account-nowon-central",
      libraryId: "nowon-central",
    });
  });

  it("rejects a tampered signature", async () => {
    const token = await signSession({
      role: "admin",
      actorRef: "account-admin",
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    const [payload, signature] = token.split(".");
    const tamperedSignature = `${signature!.startsWith("A") ? "B" : "A"}${signature!.slice(1)}`;
    const tampered = `${payload}.${tamperedSignature}`;

    await expect(
      verifySessionToken(tampered, "test-session-signing-secret"),
    ).rejects.toMatchObject({
      code: "INVALID_SESSION",
    });
  });

  it("rejects an expired session", async () => {
    const token = await signSession({
      role: "admin",
      actorRef: "account-admin",
      exp: Math.floor(Date.now() / 1000) - 1,
    });

    await expect(
      verifySessionToken(token, "test-session-signing-secret"),
    ).rejects.toMatchObject({
      code: "SESSION_EXPIRED",
    });
  });
});
