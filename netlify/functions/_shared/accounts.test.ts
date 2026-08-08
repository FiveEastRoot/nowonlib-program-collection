import { describe, expect, it } from "vitest";
import { authenticateAccount, LIBRARY_IDS } from "./accounts";

describe("account policy", () => {
  it.each(LIBRARY_IDS)("accepts the library account %s", (accountId) => {
    expect(authenticateAccount(accountId, "2468", "2468", "1357")).toEqual({
      accountId,
      role: "submitter",
      actorRef: `account-${accountId}`,
      libraryId: accountId,
    });
  });

  it("accepts the administrator account", () => {
    expect(authenticateAccount("admin", "1357", "2468", "1357")).toEqual({
      accountId: "admin",
      role: "admin",
      actorRef: "account-admin",
    });
  });

  it("normalizes the account id but requires exactly four digits", () => {
    expect(
      authenticateAccount(" NOWON-CENTRAL ", "2468", "2468", "1357"),
    ).not.toBeNull();
    expect(
      authenticateAccount("nowon-central", "24680", "2468", "1357"),
    ).toBeNull();
  });

  it("rejects an unknown account or incorrect pin", () => {
    expect(authenticateAccount("unknown", "2468", "2468", "1357")).toBeNull();
    expect(
      authenticateAccount("nowon-central", "1357", "2468", "1357"),
    ).toBeNull();
  });
});
