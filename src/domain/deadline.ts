import type { SubmissionStatus } from "./types";

export function statusAfterSubmission(
  submittedAt: string,
  deadline: string,
): SubmissionStatus {
  return new Date(submittedAt).getTime() > new Date(deadline).getTime()
    ? "late"
    : "submitted";
}

export function canSubmitterEdit(status: SubmissionStatus): boolean {
  return (
    status === "draft" ||
    status === "revision_requested" ||
    status === "resubmitted"
  );
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

