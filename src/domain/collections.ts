import type { CollectionType } from "./types";

export function collectionTypeLabel(type: CollectionType): string {
  if (type === "monthly") return "통합 수합";
  return type === "day10" ? "10일 수합(보관)" : "20일 수합(보관)";
}

export function collectionReportTitle(type: CollectionType): string {
  if (type === "monthly") return "3종 문서 공통 입력";
  return type === "day10" ? "주요 업무 현황 보고" : "주요 업무 추진 계획";
}

export function formatTargetMonth(targetMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(normalizeTargetMonth(targetMonth));
  if (!match) return targetMonth;
  return `${match[1]}년 ${Number(match[2])}월`;
}

export function normalizeTargetMonth(targetMonth: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(targetMonth)) return targetMonth;
  const date = new Date(targetMonth);
  if (Number.isNaN(date.getTime())) return targetMonth;
  const korea = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  return `${korea.getUTCFullYear()}-${String(korea.getUTCMonth() + 1).padStart(2, "0")}`;
}
