import { describe, expect, it } from "vitest";
import { createDemoSnapshot } from "../../data/demo";
import {
  buildSubmissionHistory,
  formatDateTime,
} from "./operationalPanelsData";

describe("buildSubmissionHistory", () => {
  it("returns only the selected library submission for every round", () => {
    const snapshot = createDemoSnapshot();
    const history = buildSubmissionHistory(
      snapshot.rounds,
      snapshot.submissions,
      "nowon-central",
    );

    expect(history).toHaveLength(snapshot.rounds.length);
    expect(history.every(({ submission }) =>
      submission?.libraryId === "nowon-central",
    )).toBe(true);
  });

  it("shows the unified monthly round", () => {
    const snapshot = createDemoSnapshot();
    const history = buildSubmissionHistory(
      snapshot.rounds,
      snapshot.submissions,
      "nowon-central",
    );

    expect(history.map(({ round }) => round.type)).toEqual(["monthly"]);
  });
});

describe("formatDateTime", () => {
  it("renders missing and invalid saved timestamps safely", () => {
    expect(formatDateTime("")).toBe("-");
    expect(formatDateTime("invalid-date")).toBe("-");
  });

  it("formats a valid saved timestamp", () => {
    expect(formatDateTime("2026-07-27T09:30:00+09:00")).not.toBe("-");
  });
});
