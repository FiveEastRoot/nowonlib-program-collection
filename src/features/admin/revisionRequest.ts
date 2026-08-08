import type { SubmissionStatus } from "../../domain/types";

const REVISION_REQUESTABLE_STATUSES = new Set<SubmissionStatus>([
  "submitted",
  "late",
  "resubmitted",
  "reviewed",
]);

export function canRequestRevision(status: SubmissionStatus): boolean {
  return REVISION_REQUESTABLE_STATUSES.has(status);
}

export function normalizeRevisionMessage(message: string): string {
  return message.trim();
}
