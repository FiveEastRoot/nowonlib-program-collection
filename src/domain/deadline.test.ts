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

  it("allows completed submissions to be edited before the deadline", () => {
    const beforeDeadline = new Date("2026-08-10T15:59:59+09:00").getTime();
    expect(canSubmitterEdit("submitted", "open", deadline, beforeDeadline)).toBe(
      true,
    );
    expect(
      canSubmitterEdit("resubmitted", "open", deadline, beforeDeadline),
    ).toBe(true);
  });

  it("locks completed submissions after the deadline or review", () => {
    const afterDeadline = new Date("2026-08-10T16:00:01+09:00").getTime();
    expect(canSubmitterEdit("submitted", "open", deadline, afterDeadline)).toBe(
      false,
    );
    expect(
      canSubmitterEdit("resubmitted", "open", deadline, afterDeadline),
    ).toBe(false);
    expect(canSubmitterEdit("late")).toBe(false);
    expect(canSubmitterEdit("reviewed")).toBe(false);
  });

  it("reopens editing after an administrator revision request", () => {
    expect(canSubmitterEdit("revision_requested")).toBe(true);
  });

  it("locks editable submissions while the collection is closed", () => {
    expect(canSubmitterEdit("draft", "closed")).toBe(false);
    expect(canSubmitterEdit("revision_requested", "closed")).toBe(false);
    expect(canSubmitterEdit("draft", "open")).toBe(true);
    expect(
      canSubmitterEdit(
        "submitted",
        "closed",
        deadline,
        new Date("2026-08-10T15:00:00+09:00").getTime(),
      ),
    ).toBe(false);
  });
});
