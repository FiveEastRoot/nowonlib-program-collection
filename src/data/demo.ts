import type {
  AppSnapshot,
  CollectionRound,
  Program,
  Submission,
  SubmissionStatus,
} from "../domain/types";
import { libraries } from "./libraryMaster";

export const activeRound: CollectionRound = {
  id: "2026-08-day10",
  type: "day10",
  targetMonth: "2026-08",
  title: "10일 수합 · 주요 업무 현황 보고",
  deadline: "2026-08-10T16:00:00+09:00",
};

const seedPrograms: Program[] = [
  {
    id: "program-reading",
    title: "책과 함께 크는 아이들",
    scheduleType: "single",
    startDate: "2026-08-12",
    startTime: "10:00",
    endDate: "2026-08-12",
    endTime: "12:00",
    scheduleOriginal: "2026. 8. 12.(수) 10:00~12:00",
    location: "어린이자료실",
    audience: "초등 1~3학년",
    capacity: 15,
    description: "그림책을 함께 읽고 독후활동을 진행합니다.",
    included: true,
    outputOrder: 1,
    warnings: [],
  },
  {
    id: "program-author",
    title: "작가와의 만남",
    scheduleType: "single",
    startDate: "2026-08-23",
    startTime: "14:00",
    endDate: "2026-08-23",
    endTime: "16:00",
    scheduleOriginal: "2026. 8. 23.(일) 14:00~16:00",
    location: "4층 다목적실",
    audience: "성인",
    capacity: 40,
    description: "지역 작가의 작품 세계를 함께 나누는 강연입니다.",
    included: true,
    outputOrder: 2,
    warnings: [],
  },
];

const statuses: SubmissionStatus[] = [
    "draft",
  "revision_requested",
  "submitted",
  "draft",
  "submitted",
  "late",
  "submitted",
  "revision_requested",
  "reviewed",
];

function createSubmission(index: number): Submission {
  const library = libraries[index]!;
  const status = statuses[index]!;
  const submitted =
    status === "draft" ? null : `2026-08-10T${10 + index}:2${index}:00+09:00`;
  const programs =
    index === 0
      ? structuredClone(seedPrograms)
      : structuredClone(seedPrograms).map((program, programIndex) => ({
          ...program,
          id: `${library.id}-${programIndex}`,
          title:
            programIndex === 0
              ? `${library.abbreviation} 여름 독서 프로그램`
              : `${library.abbreviation} 문화 강연`,
          warnings:
            index === 1 && programIndex === 0
              ? ["유사 제목의 중복 후보가 있습니다."]
              : [],
        }));

  return {
    id: `${activeRound.id}-${library.id}`,
    roundId: activeRound.id,
    libraryId: library.id,
    status,
    programs,
    savedAt: submitted ?? "2026-08-09T11:00:00+09:00",
    submittedAt: submitted,
    reviewNote:
      status === "revision_requested" ? "연령 표기를 확인해주세요." : "",
    audit: [],
  };
}

export function createDemoSnapshot(): AppSnapshot {
  return {
    version: 1,
    submissions: libraries.map((_, index) => createSubmission(index)),
  };
}
