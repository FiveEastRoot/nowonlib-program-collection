import { describe, expect, it } from "vitest";
import type { Program } from "../domain/types";
import { scheduleOriginalForApi } from "./remoteRepository";

function program(patch: Partial<Program> = {}): Program {
  return {
    id: "program-1",
    programType: "행사",
    title: "문화행사",
    scheduleType: "single",
    startDate: "2026-08-12",
    startTime: "10:00",
    endDate: "2026-08-12",
    endTime: "12:00",
    scheduleOriginal: "",
    location: "자료실",
    audience: "성인",
    capacity: 20,
    managerName: "김담당",
    description: "행사 설명",
    included: true,
    outputOrder: 1,
    includeCity: true,
    includeFoundation: true,
    outputOrderCity: 1,
    outputOrderFoundation: 1,
    warnings: [],
    ...patch,
  };
}

describe("scheduleOriginalForApi", () => {
  it("preserves a submitter-entered original schedule", () => {
    expect(
      scheduleOriginalForApi(
        program({ scheduleOriginal: "매주 토요일 10:00~12:00" }),
      ),
    ).toBe("매주 토요일 10:00~12:00");
  });

  it("derives a Korean schedule string when the original is empty", () => {
    expect(scheduleOriginalForApi(program())).toBe(
      "2026. 8. 12.(수) 10:00~12:00",
    );
  });

  it("formats a date range with each endpoint time", () => {
    expect(
      scheduleOriginalForApi(
        program({
          startDate: "2026-08-12",
          startTime: "10:00",
          endDate: "2026-08-14",
          endTime: "18:00",
        }),
      ),
    ).toBe("2026. 8. 12.(수) 10:00 ~ 2026. 8. 14.(금) 18:00");
  });
});
