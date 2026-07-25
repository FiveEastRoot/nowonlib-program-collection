import type { SubmissionStatus } from "../domain/types";

const statusLabels: Record<SubmissionStatus, string> = {
  draft: "작성중",
  submitted: "제출완료",
  late: "지연제출",
  revision_requested: "수정요청",
  resubmitted: "재제출완료",
  reviewed: "검토완료",
};

export function StatusLabel({ status }: { status: SubmissionStatus }) {
  return (
    <span className={`status-label status-label--${status}`}>
      <span className="status-label__dot" aria-hidden="true" />
      {statusLabels[status]}
    </span>
  );
}

