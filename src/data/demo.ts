import type {
  AppSnapshot,
  CollectionRound,
  CollectionStatus,
  Program,
  Submission,
  SubmissionStatus,
} from "../domain/types";
import { libraries } from "./libraryMaster";

export const activeRound: CollectionRound = {
  id: "2026-08-monthly",
  type: "monthly",
  targetMonth: "2026-08",
  title: "통합 수합 · 3종 문서 공통 입력",
  deadline: "2026-08-10T16:00:00+09:00",
  status: "open",
};

const seedPrograms: Program[] = [
  {
    id: "program-reading",
    programType: "행사",
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
    managerName: "김담당",
    description: "그림책을 함께 읽고 독후활동을 진행합니다.",
    included: true,
    outputOrder: 1,
    includeCity: true,
    includeFoundation: true,
    outputOrderCity: 1,
    outputOrderFoundation: 1,
    warnings: [],
  },
  {
    id: "program-author",
    programType: "강연",
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
    managerName: "이담당",
    description: "지역 작가의 작품 세계를 함께 나누는 강연입니다.",
    included: true,
    outputOrder: 2,
    includeCity: true,
    includeFoundation: true,
    outputOrderCity: 2,
    outputOrderFoundation: 2,
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

function createSubmission(index: number, round: CollectionRound): Submission {
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
              ? `${library.officialName} 여름 독서 프로그램`
              : `${library.officialName} 문화 강연`,
          warnings:
            index === 1 && programIndex === 0
              ? ["유사 제목의 중복 후보가 있습니다."]
              : [],
        }));

  return {
    id: `${round.id}-${library.id}`,
    roundId: round.id,
    libraryId: library.id,
    status,
    version: 1,
    programs,
    savedAt: submitted ?? "2026-08-09T11:00:00+09:00",
    submittedAt: submitted,
    reviewNote:
      status === "revision_requested" ? "연령 표기를 확인해주세요." : "",
    audit: [],
  };
}

export function createDemoSnapshot(
  statuses: Partial<Record<string, CollectionStatus>> = {},
): AppSnapshot {
  const demoFileId = "file_demo-day10-1";
  const rounds = [activeRound].map((round) => ({
    ...round,
    status: statuses[round.id] ?? round.status,
  }));
  return {
    version: 1,
    rounds,
    submissions: rounds.flatMap((round) =>
      libraries.map((_, index) => createSubmission(index, round)),
    ),
    generatedFiles: [
      {
        id: demoFileId,
        roundId: activeRound.id,
        documentType: "day10_city",
        version: 1,
        status: "generated",
        fileName: "2026-08_10일_주요업무현황보고.hwpx",
        generatedAt: "2026-07-27T14:30:00+09:00",
        generatedBy: "account-admin",
        checksum: `sha256:${"a".repeat(64)}`,
        notes: "program_count=6",
      },
    ],
    auditLog: [
      {
        id: "audit_demo-generated-1",
        at: "2026-07-27T14:30:00+09:00",
        actor: "account-admin",
        action: "store_generated_file",
        detail: "document_type=day10_city; version=1",
        entityType: "generated_file",
        entityId: demoFileId,
      },
    ],
  };
}

export function createDemoMonth(targetMonth: string): {
  rounds: CollectionRound[];
  submissions: Submission[];
} {
  const rounds: CollectionRound[] = [
    {
      id: `${targetMonth}-monthly`,
      type: "monthly",
      targetMonth,
      title: "통합 수합 · 3종 문서 공통 입력",
      deadline: `${targetMonth}-10T16:00:00+09:00`,
      status: "planned",
    },
  ];
  return {
    rounds,
    submissions: rounds.flatMap((round) =>
      libraries.map((library) => ({
        id: `${round.id}-${library.id}`,
        roundId: round.id,
        libraryId: library.id,
        status: "draft",
        version: 1,
        programs: [],
        savedAt: "",
        submittedAt: null,
        reviewNote: "",
        audit: [],
      })),
    ),
  };
}
