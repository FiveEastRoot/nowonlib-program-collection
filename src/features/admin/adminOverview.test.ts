import { describe, expect, it } from "vitest";
import { createDemoSnapshot } from "../../data/demo";
import {
  buildAdminOverview,
  filterAdminSubmissions,
} from "./adminOverview";

describe("admin overview and filters", () => {
  const snapshot = createDemoSnapshot();
  const roundId = snapshot.rounds[0]!.id;
  const submissions = snapshot.submissions.filter(
    (submission) => submission.roundId === roundId,
  );

  it("builds round metrics from submissions and generated files", () => {
    const metrics = buildAdminOverview(
      submissions,
      snapshot.generatedFiles.filter((file) => file.roundId === roundId),
    );

    expect(metrics).toMatchObject({
      totalLibraries: 9,
      submittedLibraries: 5,
      reviewedLibraries: 1,
      revisionLibraries: 2,
      draftLibraries: 2,
      programCount: 18,
      warningCount: 1,
      generatedFileCount: 1,
      reviewRate: 11,
    });
  });

  it("combines status and library-name filters", () => {
    const filtered = filterAdminSubmissions(
      submissions,
      "revision_requested",
      "월계",
    );

    expect(filtered.map((submission) => submission.libraryId)).toEqual([
      "wolgae",
    ]);
  });

  it("returns every submission for the default filter", () => {
    expect(filterAdminSubmissions(submissions, "all", "")).toHaveLength(9);
  });
});
