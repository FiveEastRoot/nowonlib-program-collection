import type {
  CollectionRound,
  LibraryId,
  Submission,
} from "../../domain/types";

export interface SubmissionHistoryEntry {
  round: CollectionRound;
  submission: Submission | null;
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  if (!value || Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function buildSubmissionHistory(
  rounds: CollectionRound[],
  submissions: Submission[],
  libraryId: LibraryId,
): SubmissionHistoryEntry[] {
  return [...rounds]
    .sort((left, right) => {
      const monthOrder = right.targetMonth.localeCompare(left.targetMonth);
      return monthOrder || left.type.localeCompare(right.type);
    })
    .map((round) => ({
      round,
      submission:
        submissions.find(
          (item) =>
            item.roundId === round.id && item.libraryId === libraryId,
        ) ?? null,
    }));
}
