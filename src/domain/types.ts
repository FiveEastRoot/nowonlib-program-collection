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

export type CollectionType = "monthly" | "day10" | "day20";
export type CollectionStatus = "planned" | "open" | "closed" | "archived";
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
  programType: "행사" | "강연" | "전시";
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
  managerName: string;
  description: string;
  included: boolean;
  outputOrder: number;
  includeCity: boolean;
  includeFoundation: boolean;
  outputOrderCity: number;
  outputOrderFoundation: number;
  warnings: string[];
}

export interface AuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  detail: string;
  entityType?: string;
  entityId?: string;
}

export interface GeneratedFile {
  id: string;
  roundId: string;
  documentType: "day10_city" | "day20_city" | "day20_foundation";
  version: number;
  status: string;
  fileName: string;
  generatedAt: string;
  generatedBy: string;
  checksum: string;
  notes: string;
}

export interface Submission {
  id: string;
  roundId: string;
  libraryId: LibraryId;
  status: SubmissionStatus;
  version: number;
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
  status: CollectionStatus;
}

export interface AppSnapshot {
  version: 1;
  rounds: CollectionRound[];
  submissions: Submission[];
  generatedFiles: GeneratedFile[];
  auditLog: AuditEntry[];
}
