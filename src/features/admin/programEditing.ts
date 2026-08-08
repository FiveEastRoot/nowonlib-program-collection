import type { Program } from "../../domain/types";

export type OutputOrderField =
  | "outputOrder"
  | "outputOrderCity"
  | "outputOrderFoundation";

export function canMoveProgram(
  programs: Program[],
  programId: string,
  field: OutputOrderField,
  direction: -1 | 1,
): boolean {
  const ordered = [...programs].sort((left, right) => {
    const orderDifference = left[field] - right[field];
    return orderDifference || left.id.localeCompare(right.id);
  });
  const currentIndex = ordered.findIndex((program) => program.id === programId);
  const targetIndex = currentIndex + direction;
  return (
    currentIndex >= 0 && targetIndex >= 0 && targetIndex < ordered.length
  );
}

export function moveProgram(
  programs: Program[],
  programId: string,
  field: OutputOrderField,
  direction: -1 | 1,
): Program[] {
  const ordered = [...programs].sort((left, right) => {
    const orderDifference = left[field] - right[field];
    return orderDifference || left.id.localeCompare(right.id);
  });
  const currentIndex = ordered.findIndex((program) => program.id === programId);
  const targetIndex = currentIndex + direction;
  if (!canMoveProgram(programs, programId, field, direction)) {
    return programs;
  }

  const current = ordered[currentIndex]!;
  const target = ordered[targetIndex]!;
  const currentOrder = current[field];
  const targetOrder = target[field];

  return programs.map((program) => {
    if (program.id === current.id) return { ...program, [field]: targetOrder };
    if (program.id === target.id) return { ...program, [field]: currentOrder };
    return program;
  });
}

export function canSaveProgram(program: Program): boolean {
  return Boolean(
    program.title.trim() &&
      ["행사", "강연", "전시"].includes(program.programType) &&
      program.startDate &&
      program.endDate &&
      program.location.trim() &&
      program.audience.trim() &&
      program.capacity !== null &&
      program.capacity > 0 &&
      program.managerName.trim() &&
      program.description.trim() &&
      program.startDate <= program.endDate,
  );
}
