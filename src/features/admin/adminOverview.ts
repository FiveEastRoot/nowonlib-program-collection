import type {
  GeneratedFile,
  Submission,
  SubmissionStatus,
} from "../../domain/types";
import { libraries } from "../../data/libraryMaster";

export type AdminStatusFilter = "all" | SubmissionStatus;

export interface AdminOverviewMetrics {
  totalLibraries: number;
  submittedLibraries: number;
  reviewedLibraries: number;
  revisionLibraries: number;
  draftLibraries: number;
  programCount: number;
  warningCount: number;
  generatedFileCount: number;
  reviewRate: number;
}

export function filterAdminSubmissions(
  submissions: Submission[],
  status: AdminStatusFilter,
  query: string,
): Submission[] {
  const normalizedQuery = query.trim().toLocaleLowerCase("ko-KR");
  return submissions.filter((submission) => {
    if (status !== "all" && submission.status !== status) return false;
    if (!normalizedQuery) return true;
    const library = libraries.find((item) => item.id === submission.libraryId);
    return Boolean(
      library?.officialName
        .toLocaleLowerCase("ko-KR")
        .includes(normalizedQuery),
    );
  });
}

export function buildAdminOverview(
  submissions: Submission[],
  generatedFiles: GeneratedFile[],
): AdminOverviewMetrics {
  const programCount = submissions.reduce(
    (count, submission) => count + submission.programs.length,
    0,
  );
  const warningCount = submissions.reduce(
    (count, submission) =>
      count +
      submission.programs.reduce(
        (programWarnings, program) =>
          programWarnings + program.warnings.length,
        0,
      ),
    0,
  );
  const reviewedLibraries = countStatus(submissions, "reviewed");
  const submittedLibraries = submissions.filter((submission) =>
    ["submitted", "late", "resubmitted", "reviewed"].includes(
      submission.status,
    ),
  ).length;

  return {
    totalLibraries: submissions.length,
    submittedLibraries,
    reviewedLibraries,
    revisionLibraries: countStatus(submissions, "revision_requested"),
    draftLibraries: countStatus(submissions, "draft"),
    programCount,
    warningCount,
    generatedFileCount: generatedFiles.length,
    reviewRate: submissions.length
      ? Math.round((reviewedLibraries / submissions.length) * 100)
      : 0,
  };
}

function countStatus(
  submissions: Submission[],
  status: SubmissionStatus,
): number {
  return submissions.filter((submission) => submission.status === status)
    .length;
}
