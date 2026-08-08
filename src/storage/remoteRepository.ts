import type {
  AppSnapshot,
  AuditEntry,
  CollectionRound,
  CollectionStatus,
  GeneratedFile,
  LibraryId,
  Program,
  Submission,
  SubmissionStatus,
} from "../domain/types";
import { normalizeTargetMonth } from "../domain/collections";
import type { AuthSession } from "./authClient";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

interface RawSnapshot {
  schema_version: string;
  collections: Record<string, unknown>[];
  submissions: Record<string, unknown>[];
  programs: Record<string, unknown>[];
  audit: Record<string, unknown>[];
  generated_files: Record<string, unknown>[];
  session?: {
    role: AuthSession["role"];
    actor_ref: string;
    library_id: string | null;
    expires_at: string;
  };
}

export class RemoteCollectionApi {
  constructor(
    private readonly endpoint = "/api/submissions",
    private readonly timeoutMs = 15_000,
  ) {}

  async load(): Promise<AppSnapshot> {
    const envelope = await this.request<RawSnapshot>(this.endpoint);
    return mapSnapshot(envelope);
  }

  async bootstrap(): Promise<{
    session: AuthSession;
    snapshot: AppSnapshot;
  }> {
    const envelope = await this.request<RawSnapshot>(this.endpoint);
    if (!envelope.session) {
      throw new RemoteRepositoryError(
        "INVALID_RESPONSE",
        "로그인 정보를 포함한 운영 데이터 응답이 아닙니다.",
      );
    }
    return {
      session: {
        role: envelope.session.role,
        actorRef: envelope.session.actor_ref,
        ...(envelope.session.library_id
          ? { libraryId: envelope.session.library_id as LibraryId }
          : {}),
        expiresAt: envelope.session.expires_at,
      },
      snapshot: mapSnapshot(envelope),
    };
  }

  async saveSubmission(submission: Submission): Promise<AppSnapshot> {
    await this.mutate("save_submission", {
      submission_id: submission.id,
      expected_version: submission.version,
      programs: submission.programs.map(toApiProgram),
    });
    return this.load();
  }

  async submitSubmission(submission: Submission): Promise<AppSnapshot> {
    await this.mutate("submit_submission", {
      submission_id: submission.id,
      expected_version: submission.version,
    });
    return this.load();
  }

  async appendProgram(
    submission: Submission,
    program: Program,
  ): Promise<AppSnapshot> {
    await this.mutate("append_program", {
      submission_id: submission.id,
      expected_version: submission.version,
      program: toApiProgram(program),
    });
    return this.load();
  }

  async deleteProgram(
    submission: Submission,
    program: Program,
  ): Promise<AppSnapshot> {
    await this.mutate("delete_program", {
      submission_id: submission.id,
      program_id: program.id,
      expected_version: submission.version,
    });
    return this.load();
  }

  async requestRevision(
    submission: Submission,
    message: string,
    dueAt?: string,
  ): Promise<AppSnapshot> {
    await this.mutate("request_revision", {
      submission_id: submission.id,
      expected_version: submission.version,
      message,
      due_at: dueAt ?? "",
    });
    return this.load();
  }

  async completeReview(submission: Submission): Promise<AppSnapshot> {
    await this.mutate("complete_review", {
      submission_id: submission.id,
      expected_version: submission.version,
    });
    return this.load();
  }

  async setCollectionStatus(
    collectionId: string,
    status: Extract<CollectionStatus, "open" | "closed">,
  ): Promise<AppSnapshot> {
    await this.mutate("set_collection_status", {
      collection_id: collectionId,
      status,
    });
    return this.load();
  }

  async createCollectionMonth(targetMonth: string): Promise<AppSnapshot> {
    await this.mutate("create_collection_month", {
      target_month: targetMonth,
    });
    return this.load();
  }

  private async mutate(
    action: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.request(this.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: `request-${crypto.randomUUID()}`,
        action,
        payload,
      }),
    });
  }

  private async request<T = unknown>(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await fetch(input, {
        credentials: "same-origin",
        ...init,
        signal: controller.signal,
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        throw new RemoteRepositoryError(
          "REQUEST_TIMEOUT",
          "운영 데이터 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.",
        );
      }
      throw new RemoteRepositoryError(
        "NETWORK_ERROR",
        "운영 데이터 서비스에 연결할 수 없습니다.",
      );
    } finally {
      window.clearTimeout(timeout);
    }
    let envelope: ApiEnvelope<T>;
    try {
      envelope = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new RemoteRepositoryError(
        "INVALID_RESPONSE",
        "운영 데이터 응답을 해석하지 못했습니다.",
      );
    }
    if (!response.ok || !envelope.ok || typeof envelope.data === "undefined") {
      throw new RemoteRepositoryError(
        envelope.error?.code ?? "API_ERROR",
        envelope.error?.message ?? "운영 데이터를 처리하지 못했습니다.",
      );
    }
    return envelope.data;
  }
}

export class RemoteRepositoryError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function mapSnapshot(raw: RawSnapshot): AppSnapshot {
  const programsBySubmission = groupBy(raw.programs, "submission_id");
  const auditsBySubmission = groupBy(raw.audit, "entity_id");
  return {
    version: 1,
    rounds: uniqueBy(raw.collections, "collection_id").map(mapCollection),
    submissions: uniqueBy(raw.submissions, "submission_id").map((submission) =>
      mapSubmission(
        submission,
        programsBySubmission[text(submission.submission_id)] ?? [],
        auditsBySubmission[text(submission.submission_id)] ?? [],
      ),
    ),
    generatedFiles: (raw.generated_files ?? []).map(mapGeneratedFile),
    auditLog: raw.audit.map(mapAudit),
  };
}

function mapCollection(raw: Record<string, unknown>): CollectionRound {
  return {
    id: text(raw.collection_id),
    type: text(raw.collection_type) as CollectionRound["type"],
    targetMonth: normalizeTargetMonth(text(raw.target_month)),
    title: text(raw.title),
    deadline: text(raw.deadline_at),
    status: mapCollectionStatus(raw.status),
  };
}

function mapCollectionStatus(value: unknown): CollectionStatus {
  const status = text(value);
  return ["planned", "open", "closed", "archived"].includes(status)
    ? (status as CollectionStatus)
    : "planned";
}

function mapSubmission(
  raw: Record<string, unknown>,
  programs: Record<string, unknown>[],
  audit: Record<string, unknown>[],
): Submission {
  return {
    id: text(raw.submission_id),
    roundId: text(raw.collection_id),
    libraryId: text(raw.library_id) as LibraryId,
    status: text(raw.status) as SubmissionStatus,
    version: number(raw.version, 1),
    programs: programs.map(mapProgram),
    savedAt: text(raw.saved_at),
    submittedAt: text(raw.submitted_at) || null,
    reviewNote: text(raw.review_note),
    audit: audit.map(mapAudit),
  };
}

function mapProgram(raw: Record<string, unknown>, index: number): Program {
  const validationMessages = text(raw.validation_messages);
  return {
    id: text(raw.program_id),
    programType: (["행사", "강연", "전시"].includes(text(raw.program_type))
      ? text(raw.program_type)
      : "행사") as Program["programType"],
    title: text(raw.title_original),
    scheduleType: text(raw.schedule_type, "single") as Program["scheduleType"],
    startDate: text(raw.start_date),
    startTime: text(raw.start_time),
    endDate: text(raw.end_date),
    endTime: text(raw.end_time),
    scheduleOriginal: text(raw.schedule_original),
    location: text(raw.location),
    audience: text(raw.audience),
    capacity:
      raw.capacity === "" || raw.capacity === null
        ? null
        : number(raw.capacity, 0),
    managerName: text(raw.manager_name),
    description: text(raw.description_original),
    included: boolean(raw.include_day10, true),
    outputOrder: number(raw.output_order_day10, index + 1),
    includeCity: boolean(raw.include_city, true),
    includeFoundation: boolean(raw.include_foundation, true),
    outputOrderCity: number(raw.output_order_city, index + 1),
    outputOrderFoundation: number(
      raw.output_order_foundation,
      index + 1,
    ),
    warnings: validationMessages ? validationMessages.split(" | ") : [],
  };
}

function mapAudit(raw: Record<string, unknown>): AuditEntry {
  return {
    id: text(raw.audit_id),
    at: text(raw.created_at),
    actor: text(raw.actor_ref),
    action: text(raw.action),
    detail: text(raw.detail),
    entityType: text(raw.entity_type),
    entityId: text(raw.entity_id),
  };
}

function mapGeneratedFile(raw: Record<string, unknown>): GeneratedFile {
  return {
    id: text(raw.file_id),
    roundId: text(raw.collection_id),
    documentType: text(raw.document_type) as GeneratedFile["documentType"],
    version: number(raw.version, 1),
    status: text(raw.status),
    fileName: text(raw.file_name),
    generatedAt: text(raw.generated_at),
    generatedBy: text(raw.generated_by),
    checksum: text(raw.checksum),
    notes: text(raw.notes),
  };
}

function toApiProgram(program: Program): Record<string, unknown> {
  return {
    program_id: program.id,
    program_type: program.programType,
    title_original: program.title,
    schedule_type: program.scheduleType,
    schedule_original: scheduleOriginalForApi(program),
    start_date: program.startDate,
    start_time: program.startTime,
    end_date: program.endDate,
    end_time: program.endTime,
    location: program.location,
    audience: program.audience,
    capacity: program.capacity ?? "",
    manager_name: program.managerName,
    description_original: program.description,
    include_day10: program.included,
    output_order_day10: program.outputOrder,
    include_city: program.includeCity,
    include_foundation: program.includeFoundation,
    output_order_city: program.outputOrderCity,
    output_order_foundation: program.outputOrderFoundation,
  };
}

export function scheduleOriginalForApi(program: Program): string {
  const original = program.scheduleOriginal.trim();
  if (original) return original;

  const startDate = formatScheduleDate(program.startDate);
  const endDate = formatScheduleDate(program.endDate);
  const startTime = program.startTime.trim();
  const endTime = program.endTime.trim();

  if (startDate && startDate === endDate) {
    const time =
      startTime && endTime
        ? `${startTime}~${endTime}`
        : startTime || endTime;
    return [startDate, time].filter(Boolean).join(" ");
  }

  const start = [startDate, startTime].filter(Boolean).join(" ");
  const end = [endDate, endTime].filter(Boolean).join(" ");
  return start && end ? `${start} ~ ${end}` : start || end;
}

function formatScheduleDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value.trim();
  const [, year, month, day] = match;
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][
    new Date(
      Date.UTC(Number(year), Number(month) - 1, Number(day)),
    ).getUTCDay()
  ];
  return `${year}. ${Number(month)}. ${Number(day)}.(${weekday})`;
}

function groupBy(
  rows: Record<string, unknown>[],
  field: string,
): Record<string, Record<string, unknown>[]> {
  return rows.reduce<Record<string, Record<string, unknown>[]>>(
    (groups, row) => {
      const key = text(row[field]);
      (groups[key] ??= []).push(row);
      return groups;
    },
    {},
  );
}

function uniqueBy(
  rows: Record<string, unknown>[],
  field: string,
): Record<string, unknown>[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = text(row[field]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string"
    ? value
    : value === null || typeof value === "undefined"
      ? fallback
      : String(value);
}

function number(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boolean(value: unknown, fallback: boolean): boolean {
  if (value === "" || value === null || typeof value === "undefined") {
    return fallback;
  }
  return value === true || value === "TRUE" || value === "true" || value === 1;
}
