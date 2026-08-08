import { describe, expect, it } from "vitest";
import {
  canRequestRevision,
  normalizeRevisionMessage,
} from "./revisionRequest";

describe("revision request", () => {
  it.each(["submitted", "late", "resubmitted", "reviewed"] as const)(
    "allows %s submissions",
    (status) => {
      expect(canRequestRevision(status)).toBe(true);
    },
  );

  it.each(["draft", "revision_requested"] as const)(
    "blocks %s submissions",
    (status) => {
      expect(canRequestRevision(status)).toBe(false);
    },
  );

  it("trims the administrator message", () => {
    expect(normalizeRevisionMessage("  일정 설명을 보완해주세요.  ")).toBe(
      "일정 설명을 보완해주세요.",
    );
  });
});
