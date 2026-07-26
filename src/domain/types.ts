export type LibraryId =
  | "nowon-central"
  | "wolgae"
  | "sanggye"
  | "buram"
  | "madeul"
  | "hwarang"
  | "nowon-children"
  | "hagye-children"
  | "wolgae-children";

export type CollectionType = "day10" | "day20";
export type Role = "submitter" | "admin";

export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "late"
  | "revision_requested"
  | "resubmitted"
  | "reviewed";

export interface Library {
  id: LibraryId;
  officialName: string;
  displayName: string;
  abbreviation: string;
  outputOrder: number;
}

export interface Program {
  id: string;
  title: string;
  scheduleType: "single" | "range" | "repeat" | "multiple";
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  scheduleOriginal: string;
  location: string;
  audience: string;
  capacity: number | null;
  description: string;
  included: boolean;
  outputOrder: number;
  warnings: string[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
}

export interface Submission {
  id: string;
  roundId: string;
  libraryId: LibraryId;
  status: SubmissionStatus;
  programs: Program[];
  savedAt: string;
  submittedAt: string | null;
  reviewNote: string;
  audit: AuditEntry[];
}

export interface CollectionRound {
  id: string;
  type: CollectionType;
  targetMonth: string;
  title: string;
  deadline: string;
}

export interface AppSnapshot {
  version: 1;
  submissions: Submission[];
}
