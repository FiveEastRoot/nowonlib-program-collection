import { describe, expect, it } from "vitest";
import type { Program } from "../../domain/types";
import {
  canMoveProgram,
  canSaveProgram,
  moveProgram,
} from "./programEditing";

function program(
  id: string,
  outputOrder: number,
  outputOrderCity = outputOrder,
  outputOrderFoundation = outputOrder,
): Program {
  return {
    id,
    programType: "행사",
    title: id,
    scheduleType: "single",
    startDate: "2026-08-01",
    startTime: "10:00",
    endDate: "2026-08-01",
    endTime: "12:00",
    scheduleOriginal: "",
    location: "강의실",
    audience: "성인",
    capacity: 10,
    managerName: "김담당",
    description: "프로그램 설명",
    included: true,
    outputOrder,
    includeCity: true,
    includeFoundation: true,
    outputOrderCity,
    outputOrderFoundation,
    warnings: [],
  };
}

describe("administrator program editing", () => {
  it("swaps only the selected output order", () => {
    const programs = [program("a", 1), program("b", 2), program("c", 3)];
    const moved = moveProgram(programs, "b", "outputOrderCity", -1);

    expect(moved.find((item) => item.id === "a")?.outputOrderCity).toBe(2);
    expect(moved.find((item) => item.id === "b")?.outputOrderCity).toBe(1);
    expect(moved.find((item) => item.id === "b")?.outputOrder).toBe(2);
  });

  it("does not move beyond the first or last item", () => {
    const programs = [program("a", 1), program("b", 2)];
    expect(canMoveProgram(programs, "a", "outputOrder", -1)).toBe(false);
    expect(canMoveProgram(programs, "a", "outputOrder", 1)).toBe(true);
    expect(moveProgram(programs, "a", "outputOrder", -1)).toBe(programs);
    expect(moveProgram(programs, "b", "outputOrder", 1)).toBe(programs);
  });

  it("requires core fields and a valid date range", () => {
    const valid = program("a", 1);
    expect(canSaveProgram(valid)).toBe(true);
    expect(canSaveProgram({ ...valid, title: "  " })).toBe(false);
    expect(canSaveProgram({ ...valid, managerName: "  " })).toBe(false);
    expect(
      canSaveProgram({
        ...valid,
        startDate: "2026-08-03",
        endDate: "2026-08-01",
      }),
    ).toBe(false);
  });
});
