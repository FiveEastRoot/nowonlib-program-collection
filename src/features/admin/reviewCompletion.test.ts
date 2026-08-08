import { describe, expect, it } from "vitest";
import { canCompleteReview } from "./reviewCompletion";

describe("review completion", () => {
  it.each(["submitted", "late", "resubmitted"] as const)(
    "allows %s submissions",
    (status) => {
      expect(canCompleteReview(status)).toBe(true);
    },
  );

  it.each(["draft", "revision_requested", "reviewed"] as const)(
    "blocks %s submissions",
    (status) => {
      expect(canCompleteReview(status)).toBe(false);
    },
  );
});
