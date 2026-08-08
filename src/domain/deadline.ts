import type { CollectionStatus, SubmissionStatus } from "./types";

export function statusAfterSubmission(
  submittedAt: string,
  deadline: string,
): SubmissionStatus {
  return new Date(submittedAt).getTime() > new Date(deadline).getTime()
    ? "late"
    : "submitted";
}

export function canSubmitterEdit(
  status: SubmissionStatus,
  collectionStatus: CollectionStatus = "open",
  deadline?: string,
  now = Date.now(),
): boolean {
  if (collectionStatus !== "open") return false;
  if (["draft", "revision_requested"].includes(status)) return true;
  if (!["submitted", "resubmitted"].includes(status) || !deadline) return false;
  return now <= new Date(deadline).getTime();
}

export function formatDeadline(deadline: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(deadline));
}
