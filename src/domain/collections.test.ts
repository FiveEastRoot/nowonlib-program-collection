import { describe, expect, it } from "vitest";
import {
  collectionReportTitle,
  collectionTypeLabel,
  formatTargetMonth,
  normalizeTargetMonth,
} from "./collections";

describe("collection presentation", () => {
  it("labels the current unified round and legacy archive", () => {
    expect(collectionTypeLabel("day10")).toBe("10일 수합(보관)");
    expect(collectionTypeLabel("day20")).toBe("20일 수합(보관)");
    expect(collectionTypeLabel("monthly")).toBe("통합 수합");
  });

  it("uses the correct report title for each round", () => {
    expect(collectionReportTitle("day10")).toBe("주요 업무 현황 보고");
    expect(collectionReportTitle("day20")).toBe("주요 업무 추진 계획");
    expect(collectionReportTitle("monthly")).toBe("3종 문서 공통 입력");
  });

  it("formats a target month without a leading zero", () => {
    expect(formatTargetMonth("2026-08")).toBe("2026년 8월");
  });

  it("restores a Sheets date value to the selected Korean target month", () => {
    expect(normalizeTargetMonth("2026-07-31T15:00:00.000Z")).toBe("2026-08");
    expect(formatTargetMonth("2026-07-31T15:00:00.000Z")).toBe("2026년 8월");
  });
});
