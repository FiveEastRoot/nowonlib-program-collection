import type { SubmissionStatus } from "../../domain/types";

const REVIEWABLE_STATUSES = new Set<SubmissionStatus>([
  "submitted",
  "late",
  "resubmitted",
]);

export function canCompleteReview(status: SubmissionStatus): boolean {
  return REVIEWABLE_STATUSES.has(status);
}
