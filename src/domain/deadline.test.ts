import { describe, expect, it } from "vitest";
import {
  canSubmitterEdit,
  statusAfterSubmission,
} from "./deadline";

describe("submission deadline", () => {
  const deadline = "2026-08-10T16:00:00+09:00";

  it("marks an on-time submission as submitted", () => {
    expect(
      statusAfterSubmission("2026-08-10T15:59:59+09:00", deadline),
    ).toBe("submitted");
  });

  it("allows submissions after the deadline and marks them late", () => {
    expect(
      statusAfterSubmission("2026-08-10T16:00:01+09:00", deadline),
    ).toBe("late");
  });

  it("locks submitter editing after submission", () => {
    expect(canSubmitterEdit("submitted")).toBe(false);
    expect(canSubmitterEdit("late")).toBe(false);
    expect(canSubmitterEdit("reviewed")).toBe(false);
  });

  it("reopens editing after an administrator revision request", () => {
    expect(canSubmitterEdit("revision_requested")).toBe(true);
  });
});

