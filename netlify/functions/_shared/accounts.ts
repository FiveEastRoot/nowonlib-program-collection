import type { SessionPrincipal } from "./session";

export const LIBRARY_IDS = [
  "nowon-central",
  "wolgae",
  "buram",
  "sanggye",
  "madeul",
  "hwarang",
  "nowon-children",
  "hagye-children",
  "wolgae-children",
] as const;

export type LibraryAccountId = (typeof LIBRARY_IDS)[number];

export interface AuthenticatedAccount
  extends Omit<SessionPrincipal, "exp"> {
  accountId: string;
}

export function authenticateAccount(
  rawAccountId: unknown,
  rawPin: unknown,
  submitterPin: string,
  adminPin: string,
): AuthenticatedAccount | null {
  if (typeof rawAccountId !== "string" || typeof rawPin !== "string") {
    return null;
  }
  const accountId = rawAccountId.trim().toLowerCase();
  const pin = rawPin.trim();
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(accountId) || !/^\d{4}$/.test(pin)) {
    return null;
  }

  if (accountId === "admin" && safeEqual(pin, adminPin)) {
    return {
      accountId,
      role: "admin",
      actorRef: "account-admin",
    };
  }
  if (
    LIBRARY_IDS.includes(accountId as LibraryAccountId) &&
    safeEqual(pin, submitterPin)
  ) {
    return {
      accountId,
      role: "submitter",
      actorRef: `account-${accountId}`,
      libraryId: accountId,
    };
  }
  return null;
}

function safeEqual(left: string, right: string): boolean {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let difference = leftBytes.length ^ rightBytes.length;
  const length = Math.max(leftBytes.length, rightBytes.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}
