import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  FilePlus2,
  FileOutput,
  LockKeyhole,
  Pencil,
  RotateCw,
  Search,
  Send,
  Trash2,
  UnlockKeyhole,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  collectionReportTitle,
  collectionTypeLabel,
  formatTargetMonth,
} from "../../domain/collections";
import { formatDeadline } from "../../domain/deadline";
import {
  collectionStatusLabels,
  nextCollectionStatus,
} from "../../domain/collectionStatus";
import type {
  AuditEntry,
  CollectionRound,
  CollectionStatus,
  CollectionType,
  GeneratedFile,
  Program,
  Submission,
} from "../../domain/types";
import type { AdminView } from "../../components/AppShell";
import { libraries } from "../../data/libraryMaster";
import { StatusLabel } from "../../components/StatusLabel";
import {
  buildAdminOverview,
  filterAdminSubmissions,
  type AdminStatusFilter,
} from "./adminOverview";
import {
  canRequestRevision,
  normalizeRevisionMessage,
} from "./revisionRequest";
import { canCompleteReview } from "./reviewCompletion";
import {
  canMoveProgram,
  canSaveProgram,
  moveProgram,
  type OutputOrderField,
} from "./programEditing";
import type {
  HwpxDocumentType,
  HwpxPreview,
  HwpxRequest,
} from "../../storage/hwpxClient";

interface AdminDashboardProps {
  adminView: AdminView;
  auditLog: AuditEntry[];
  generatedFiles: GeneratedFile[];
  rounds: CollectionRound[];
  submissions: Submission[];
  round: CollectionRound;
  busy: boolean;
  onRoundTypeChange: (type: CollectionType) => void;
  onTargetMonthChange: (targetMonth: string) => void;
  onSave: (submission: Submission) => Promise<boolean>;
  onCompleteReview: (submission: Submission) => Promise<boolean>;
  onCreateCollectionMonth: (targetMonth: string) => Promise<boolean>;
  onDeleteProgram: (
    submission: Submission,
    program: Program,
  ) => Promise<boolean>;
  onPreviewHwpx: (request: HwpxRequest) => Promise<HwpxPreview | null>;
  onGenerateHwpx: (request: HwpxRequest) => Promise<string | null>;
  onDownloadGeneratedFile: (fileId: string) => Promise<boolean>;
  onAdminViewChange: (view: AdminView) => void;
  onSetCollectionStatus: (
    collectionId: string,
    status: Extract<CollectionStatus, "open" | "closed">,
  ) => Promise<boolean>;
  onRequestRevision: (
    submission: Submission,
    message: string,
  ) => Promise<boolean>;
}

interface OrderControlProps {
  label: string;
  program: Program;
  programs: Program[];
  field: OutputOrderField;
  busy: boolean;
  onMove: (
    programId: string,
    field: OutputOrderField,
    direction: -1 | 1,
  ) => void;
}

function OrderControl({
  label,
  program,
  programs,
  field,
  busy,
  onMove,
}: OrderControlProps) {
  return (
    <span className="order-control">
      {label ? <small>{label}</small> : null}
      <b>{program[field]}</b>
      <button
        aria-label={`${program.title} ${label || "출력"} 순서 위로`}
        disabled={busy || !canMoveProgram(programs, program.id, field, -1)}
        onClick={() => onMove(program.id, field, -1)}
        title="한 칸 위로"
        type="button"
      >
        <ArrowUp size={13} />
      </button>
      <button
        aria-label={`${program.title} ${label || "출력"} 순서 아래로`}
        disabled={busy || !canMoveProgram(programs, program.id, field, 1)}
        onClick={() => onMove(program.id, field, 1)}
        title="한 칸 아래로"
        type="button"
      >
        <ArrowDown size={13} />
      </button>
    </span>
  );
}

export function AdminDashboard({
  adminView,
  auditLog,
  generatedFiles,
  rounds,
  submissions,
  round,
  busy,
  onRoundTypeChange,
  onTargetMonthChange,
  onSave,
  onCompleteReview,
  onCreateCollectionMonth,
  onDeleteProgram,
  onPreviewHwpx,
  onGenerateHwpx,
  onDownloadGeneratedFile,
  onAdminViewChange,
  onSetCollectionStatus,
  onRequestRevision,
}: AdminDashboardProps) {
  const [selectedId, setSelectedId] = useState(submissions[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<AdminStatusFilter>("all");
  const [revisionTarget, setRevisionTarget] = useState<Submission | null>(null);
  const [reviewTarget, setReviewTarget] = useState<Submission | null>(null);
  const [collectionStatusTarget, setCollectionStatusTarget] = useState<
    Extract<CollectionStatus, "open" | "closed"> | null
  >(null);
  const [showMonthDialog, setShowMonthDialog] = useState(false);
  const [newTargetMonth, setNewTargetMonth] = useState(
    nextTargetMonth(round.targetMonth),
  );
  const [editDraft, setEditDraft] = useState<Program | null>(null);
  const [revisionMessage, setRevisionMessage] = useState("");
  const [documentType, setDocumentType] =
    useState<HwpxDocumentType>("day10_city");
  const [reviewedOnly, setReviewedOnly] = useState(true);
  const [excludeWarnings, setExcludeWarnings] = useState(false);
  const [hwpxPreview, setHwpxPreview] = useState<HwpxPreview | null>(null);
  const [generatedFileName, setGeneratedFileName] = useState("");
  const summary = useMemo(
    () =>
      submissions.reduce<Record<string, number>>((result, submission) => {
        result[submission.status] = (result[submission.status] ?? 0) + 1;
        return result;
      }, {}),
    [submissions],
  );
  const filtered = filterAdminSubmissions(
    submissions,
    statusFilter,
    query,
  );
  const selected =
    filtered.find((item) => item.id === selectedId) ?? filtered[0];
  const roundGeneratedFiles = useMemo(
    () =>
      generatedFiles
        .filter((file) => file.roundId === round.id)
        .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    [generatedFiles, round.id],
  );
  const overview = useMemo(
    () => buildAdminOverview(submissions, roundGeneratedFiles),
    [roundGeneratedFiles, submissions],
  );
  const targetMonths = useMemo(
    () =>
      [...new Set(rounds.map((item) => item.targetMonth))].sort((left, right) =>
        right.localeCompare(left),
      ),
    [rounds],
  );
  const documentRound = round;
  const recentAudit = auditLog
    .filter(
      (entry) =>
        entry.entityType === "generated_file" ||
        roundGeneratedFiles.some((file) => file.id === entry.entityId),
    )
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 8);

  async function updateSelected(
    patch: Partial<Submission>,
  ): Promise<boolean> {
    if (!selected) return false;
    return onSave({
      ...selected,
      ...patch,
      audit: [
        ...selected.audit,
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          actor: "수합 관리자",
          action: "직접 수정",
          detail: Object.keys(patch).join(", "),
        },
      ],
    });
  }

  function toggleIncluded(
    programId: string,
    field: "included" | "includeCity" | "includeFoundation",
  ) {
    if (!selected) return;
    void updateSelected({
      programs: selected.programs.map((program) =>
        program.id === programId
          ? { ...program, [field]: !program[field] }
          : program,
      ),
    });
  }

  function moveOutputOrder(
    programId: string,
    field: OutputOrderField,
    direction: -1 | 1,
  ) {
    if (!selected || busy) return;
    const programs = moveProgram(
      selected.programs,
      programId,
      field,
      direction,
    );
    if (programs === selected.programs) return;
    void updateSelected({ programs });
  }

  function openProgramEditor(program: Program) {
    setEditDraft(structuredClone(program));
  }

  function closeProgramEditor() {
    if (busy) return;
    setEditDraft(null);
  }

  function updateEditDraft(patch: Partial<Program>) {
    setEditDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveProgramEdit() {
    if (!selected || !editDraft || busy || !canSaveProgram(editDraft)) return;
    const saved = await updateSelected({
      programs: selected.programs.map((program) =>
        program.id === editDraft.id ? editDraft : program,
      ),
    });
    if (saved) setEditDraft(null);
  }

  async function deleteProgram(program: Program) {
    if (!selected || busy) return;
    if (
      !window.confirm(
        "프로그램을 삭제하면 시트에서도 완전히 삭제됩니다. 삭제할까요?",
      )
    ) {
      return;
    }
    await onDeleteProgram(selected, program);
  }

  function openRevisionRequest(submission: Submission) {
    setRevisionTarget(submission);
    setRevisionMessage("");
  }

  function closeRevisionRequest() {
    if (busy) return;
    setRevisionTarget(null);
    setRevisionMessage("");
  }

  async function sendRevisionRequest() {
    if (!revisionTarget || busy) return;
    const message = normalizeRevisionMessage(revisionMessage);
    if (!message) return;
    const sent = await onRequestRevision(revisionTarget, message);
    if (sent) {
      setRevisionTarget(null);
      setRevisionMessage("");
    }
  }

  async function completeReview() {
    if (!reviewTarget || busy) return;
    const completed = await onCompleteReview(reviewTarget);
    if (completed) {
      setReviewTarget(null);
    }
  }

  function currentHwpxRequest(): HwpxRequest {
    return {
      collectionId: documentRound?.id ?? round.id,
      documentType,
      reviewedOnly: true,
      excludeWarnings,
    };
  }

  async function previewHwpx() {
    if (busy) return;
    const preview = await onPreviewHwpx(currentHwpxRequest());
    if (preview) {
      setHwpxPreview(preview);
      setGeneratedFileName("");
    }
  }

  async function generateHwpx() {
    if (busy) return;
    const request = currentHwpxRequest();
    const fileName = await onGenerateHwpx(request);
    if (fileName) {
      const preview = hwpxPreview ?? (await onPreviewHwpx(request));
      setGeneratedFileName(fileName);
      if (preview) setHwpxPreview(preview);
    }
  }

  async function generateAllHwpx() {
    if (busy) return;
    const names: string[] = [];
    for (const type of [
      "day10_city",
      "day20_city",
      "day20_foundation",
    ] as const) {
      const fileName = await onGenerateHwpx({
        ...currentHwpxRequest(),
        collectionId: round.id,
        documentType: type,
      });
      if (!fileName) return;
      names.push(fileName);
    }
    setGeneratedFileName(`3종 생성 완료: ${names.join(", ")}`);
  }

  async function confirmCollectionStatusChange() {
    if (!collectionStatusTarget || busy) return;
    const changed = await onSetCollectionStatus(
      round.id,
      collectionStatusTarget,
    );
    if (changed) setCollectionStatusTarget(null);
  }

  async function createMonth() {
    if (busy || targetMonths.includes(newTargetMonth)) return;
    if (await onCreateCollectionMonth(newTargetMonth)) {
      setShowMonthDialog(false);
      setNewTargetMonth(nextTargetMonth(newTargetMonth));
    }
  }

  const collectionStatusAction = nextCollectionStatus(round.status);

  return (
    <section className="workspace admin-workspace">
      <div className="admin-topline">
        <div>
          <h1>수합 관리자</h1>
          <p>관별 제출자료를 검토하고 HWPX 출력 대상을 확정합니다.</p>
        </div>
        <div className="admin-selectors">
          <label className="selector-with-icon">
            <CalendarDays size={17} />
            <span className="selector-label">대상 월</span>
            <select
              aria-label="대상 월"
              className="selector selector--select"
              disabled={busy}
              onChange={(event) =>
                onTargetMonthChange(event.target.value)
              }
              value={round.targetMonth}
            >
              {targetMonths.map((month) => (
                <option key={month} value={month}>
                  {formatTargetMonth(month)}
                </option>
              ))}
            </select>
          </label>
          <select
            aria-label="수합 유형"
            className="selector selector--select"
            disabled={busy}
            onChange={(event) =>
              onRoundTypeChange(event.target.value as CollectionType)
            }
            value={round.type}
          >
            {round.type === "monthly" ? (
              <option value="monthly">통합 수합</option>
            ) : round.type === "day10" ? (
              <option value="day10">10일 수합(보관)</option>
            ) : (
              <option value="day20">20일 수합(보관)</option>
            )}
          </select>
          <span className="deadline-chip">
            제출 마감 {formatDeadline(round.deadline)}
          </span>
          <span
            className={`collection-status-chip is-${round.status}`}
            role="status"
          >
            {collectionStatusLabels[round.status]}
          </span>
          {collectionStatusAction ? (
            <button
              className="button button--outline collection-status-button"
              disabled={busy}
              onClick={() =>
                setCollectionStatusTarget(collectionStatusAction)
              }
              type="button"
            >
              {collectionStatusAction === "closed" ? (
                <LockKeyhole size={16} />
              ) : (
                <UnlockKeyhole size={16} />
              )}
              {collectionStatusAction === "closed" ? "수합 마감" : "수합 열기"}
            </button>
          ) : null}
          <button
            className="button button--outline collection-status-button"
            disabled={busy}
            onClick={() => setShowMonthDialog(true)}
            type="button"
          >
            <FilePlus2 size={16} />
            새 대상 월 준비
          </button>
        </div>
      </div>

      <div className="status-summary">
        <strong>관별 제출 현황</strong>
        <span>전체 9개관</span>
        <div>
          <span>
            제출완료 <b>{summary.submitted ?? 0}</b>
          </span>
          <span>
            작성중 <b>{summary.draft ?? 0}</b>
          </span>
          <span className="is-late">
            지연제출 <b>{summary.late ?? 0}</b>
          </span>
          <span>
            수정요청 <b>{summary.revision_requested ?? 0}</b>
          </span>
          <span>
            검토완료 <b>{summary.reviewed ?? 0}</b>
          </span>
        </div>
      </div>

      {adminView === "dashboard" ? (
        <>
        <section className="admin-overview" aria-label="관리자 대시보드">
          <div className="overview-metrics">
            <article>
              <span>제출 관</span>
              <strong>
                {overview.submittedLibraries}/{overview.totalLibraries}
              </strong>
              <small>제출·지연·재제출·검토완료</small>
            </article>
            <article>
              <span>검토 진행률</span>
              <strong>{overview.reviewRate}%</strong>
              <small>검토완료 {overview.reviewedLibraries}개관</small>
            </article>
            <article>
              <span>수합 프로그램</span>
              <strong>{overview.programCount}건</strong>
              <small>오류·경고 {overview.warningCount}건</small>
            </article>
            <article>
              <span>생성 파일</span>
              <strong>{overview.generatedFileCount}개</strong>
              <small>현재 회차 Drive 보관 이력</small>
            </article>
          </div>
          <div className="overview-progress">
            <div>
              <strong>검토 완료 진행</strong>
              <span>{overview.reviewRate}%</span>
            </div>
            <progress
              aria-label="검토 완료 진행률"
              max="100"
              value={overview.reviewRate}
            />
          </div>
          <div className="overview-attention">
            <article>
              <strong>확인 필요</strong>
              <span>
                수정 요청 {overview.revisionLibraries}개관 · 오류·경고{" "}
                {overview.warningCount}건
              </span>
              <button
                className="button button--secondary button--small"
                onClick={() => {
                  setStatusFilter(
                    overview.revisionLibraries
                      ? "revision_requested"
                      : "all",
                  );
                  onAdminViewChange("collection");
                }}
                type="button"
              >
                수합 목록에서 확인
              </button>
            </article>
            <article>
              <strong>미제출 자료</strong>
              <span>작성중 {overview.draftLibraries}개관</span>
              <button
                className="button button--outline button--small"
                onClick={() => {
                  setStatusFilter("draft");
                  onAdminViewChange("collection");
                }}
                type="button"
              >
                작성중 자료 보기
              </button>
            </article>
          </div>
        </section>
        <section
          className="dashboard-document-review"
          aria-label="출력 문서 확인"
        >
          <div className="dashboard-document-review__heading">
            <div>
              <span>출력 문서 확인</span>
              <h2>{formatTargetMonth(round.targetMonth)} 검토완료 자료</h2>
            </div>
            <strong>검토완료 항목만 반영</strong>
          </div>
          <div className="document-type-tabs" role="tablist">
            {[
              ["day10_city", "구청 현황보고"],
              ["day20_city", "구청 추진계획"],
              ["day20_foundation", "재단 월간일정표"],
            ].map(([type, label]) => (
              <button
                aria-selected={documentType === type}
                className={documentType === type ? "is-active" : ""}
                disabled={busy}
                key={type}
                onClick={() => {
                  setDocumentType(type as HwpxDocumentType);
                  setHwpxPreview(null);
                  setGeneratedFileName("");
                }}
                role="tab"
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
          <div className="document-review-layout">
            <article
              className={`document-preview document-preview--dashboard is-${documentType}`}
            >
              {!hwpxPreview ? (
                <div className="document-preview-placeholder">
                  <strong>
                    {documentRound
                      ? `${formatTargetMonth(documentRound.targetMonth)} ${documentTypeLabel(
                          documentType,
                        )}`
                      : "해당 회차가 준비되지 않았습니다."}
                  </strong>
                  <span>HTML 미리보기로 실제 출력 양식을 확인하세요.</span>
                </div>
              ) : !hwpxPreview.programs.length ? (
                <p className="document-preview-empty">
                  현재 조건에 포함되는 검토완료 프로그램이 없습니다.
                </p>
              ) : documentType === "day10_city" ? (
                <div className="day10-document">
                  <div className="day10-document__section-title">
                    <b>10.</b>
                    <strong>
                      공공도서관 주요 행사 추진 사항 [노원구립도서관]
                    </strong>
                  </div>
                  <h3>{hwpxPreview.title}</h3>
                  <div className="day10-document__table" role="table">
                    {hwpxPreview.programs.map((program, index) => (
                      <div
                        className="day10-document__row"
                        key={`${program.libraryAbbreviation}-${program.title}-${index}`}
                        role="row"
                      >
                        <b>{index + 1}</b>
                        <div>
                          <strong>
                            〇 &lt;{program.libraryName}&gt;{" "}
                            {program.title}
                          </strong>
                          <span>- 일시 : {program.schedule || "미입력"}</span>
                          <span>- 장소 : {program.location || "미입력"}</span>
                          <span>
                            - 대상 : {program.audience || "미입력"}
                            {program.capacity === null
                              ? ""
                              : ` ${program.capacity}명`}
                          </span>
                          <span>
                            - 내용 : {program.description || "미입력"}
                          </span>
                        </div>
                        <span className="day10-document__image">
                          이미지 삽입 영역
                          <small>Google Drive 사진 별도</small>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : documentType === "day20_city" ? (
                <div className="day20-city-document">
                  <h3>{hwpxPreview.title}</h3>
                  {hwpxPreview.programs.map((program, index) => (
                    <section
                      key={`${program.libraryAbbreviation}-${program.title}-${index}`}
                    >
                      <h4>
                        {index + 1}. [{program.programType || "행사"}] {program.title}
                        <small>({program.libraryName})</small>
                      </h4>
                      <p>○ 개요 : {program.description || "미입력"}</p>
                      <p>○ 일시 : {program.schedule || "미입력"}</p>
                      <p>○ 장소 : {program.location || "미입력"}</p>
                      <p>
                        ○ 대상 : {program.audience || "미입력"}
                        {program.capacity === null
                          ? ""
                          : ` ${program.capacity}명`}
                      </p>
                      <p>○ 담당자 : {program.managerName || "미입력"}</p>
                    </section>
                  ))}
                </div>
              ) : (
                <div className="foundation-document">
                  <h3>{hwpxPreview.title}</h3>
                  <strong>◎ 부서 : 노원구립도서관</strong>
                  <div className="foundation-document__table" role="table">
                    <div className="foundation-document__row is-header" role="row">
                      <b>연 번</b>
                      <b>일 시</b>
                      <b>내 용</b>
                      <b>장 소</b>
                      <b>담 당 자</b>
                    </div>
                    {hwpxPreview.programs.map((program, index) => (
                      <div
                        className="foundation-document__row"
                        key={`${program.libraryAbbreviation}-${program.title}-${index}`}
                        role="row"
                      >
                        <span>{index + 1}</span>
                        <span>{program.schedule || "미입력"}</span>
                        <strong>
                          [{program.libraryName}] {program.title}
                        </strong>
                        <span>{program.location || "미입력"}</span>
                        <span>{program.managerName || "미입력"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <footer>
                실제 HWPX 양식 구조를 HTML로 재현한 미리보기입니다.
              </footer>
            </article>
            <aside className="document-review-actions">
              <label>
                <span>오류 항목 제외</span>
                <input
                  checked={excludeWarnings}
                  disabled={busy}
                  onChange={(event) => {
                    setExcludeWarnings(event.target.checked);
                    setHwpxPreview(null);
                    setGeneratedFileName("");
                  }}
                  type="checkbox"
                />
              </label>
              <button
                className="button button--secondary"
                disabled={busy || !documentRound}
                onClick={() => void previewHwpx()}
                type="button"
              >
                <RotateCw size={17} />
                {busy ? "처리 중…" : "HTML 미리보기"}
              </button>
              <button
                className="button button--primary"
                disabled={busy || !documentRound}
                onClick={() => void generateAllHwpx()}
                type="button"
              >
                <FileOutput size={18} />
                {busy ? "생성 중…" : "3종 HWPX 한번에 생성"}
              </button>
              {generatedFileName ? (
                <p className="output-success" role="status">
                  <Check size={14} />
                  {generatedFileName}
                </p>
              ) : null}
              <p className="output-note">
                <AlertTriangle size={14} />
                같은 수합자료로 HWPX 3종을 Drive에 보관하고 브라우저에도 내려받습니다. 사진은 별도
                확인 후 삽입합니다.
              </p>
            </aside>
          </div>
        </section>
        </>
      ) : (
      <div
        className={`admin-grid ${
          adminView === "history" ? "" : "admin-grid--collection"
        }`}
      >
        <div className="admin-primary">
          <div className="table-tools">
            <select
              aria-label="제출 상태 필터"
              className="selector selector--select"
              disabled={busy}
              onChange={(event) =>
                setStatusFilter(
                  event.target.value as AdminStatusFilter,
                )
              }
              value={statusFilter}
            >
              <option value="all">전체 상태</option>
              <option value="draft">작성중</option>
              <option value="submitted">제출완료</option>
              <option value="late">지연제출</option>
              <option value="revision_requested">수정요청</option>
              <option value="resubmitted">재제출</option>
              <option value="reviewed">검토완료</option>
            </select>
            <label className="search-field">
              <Search size={17} />
              <input
                placeholder="관명 검색"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>

          <div className="submission-table" role="table">
            <div className="submission-table__head" role="row">
              <span>순서</span>
              <span>관명</span>
              <span>제출 상태</span>
              <span>제출 일시</span>
              <span>오류</span>
              <span>검토 상태</span>
              <span />
            </div>
            {filtered.map((submission) => {
              const library = libraries.find(
                (item) => item.id === submission.libraryId,
              )!;
              const warnings = submission.programs.reduce(
                (count, program) => count + program.warnings.length,
                0,
              );
              const open = selectedId === submission.id;
              return (
                <button
                  key={submission.id}
                  className={`submission-row ${open ? "is-selected" : ""}`}
                  onClick={() => setSelectedId(submission.id)}
                  role="row"
                >
                  <span>{library.outputOrder}</span>
                  <strong>{library.officialName}</strong>
                  <StatusLabel status={submission.status} />
                  <span>
                    {submission.submittedAt
                      ? new Intl.DateTimeFormat("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          hour12: false,
                        }).format(new Date(submission.submittedAt))
                      : "-"}
                  </span>
                  <span className={warnings ? "text-error" : ""}>
                    {warnings}
                  </span>
                  <span>
                    {submission.status === "reviewed" ? "검토완료" : "-"}
                  </span>
                  <span>{open ? <ChevronUp /> : <ChevronDown />}</span>
                </button>
              );
            })}
            {!filtered.length ? (
              <p className="submission-empty" role="status">
                선택한 조건에 해당하는 도서관이 없습니다.
              </p>
            ) : null}
          </div>

          {selected ? (
            <div className="library-detail">
              <div className="library-detail__heading">
                <div>
                  <strong>
                    {
                      libraries.find(
                        (item) => item.id === selected.libraryId,
                      )!.officialName
                    }
                  </strong>
                  <span>프로그램 {selected.programs.length}건</span>
                </div>
                <div>
                  <button
                    className="button button--secondary button--small"
                    disabled={busy || !canRequestRevision(selected.status)}
                    title={
                      canRequestRevision(selected.status)
                        ? "제출자에게 수정 요청을 보냅니다."
                        : "제출 완료 자료에서만 수정 요청할 수 있습니다."
                    }
                    onClick={() => openRevisionRequest(selected)}
                  >
                    <Send size={15} />
                    수정 요청
                  </button>
                  <button
                    className="button button--outline button--small"
                    disabled={busy || !canCompleteReview(selected.status)}
                    title={
                      canCompleteReview(selected.status)
                        ? "이 제출자료의 검토를 완료합니다."
                        : "제출 완료 또는 재제출 자료에서만 처리할 수 있습니다."
                    }
                    onClick={() => setReviewTarget(selected)}
                  >
                    <Check size={15} />
                    검토 완료
                  </button>
                </div>
              </div>
              <div
                className={`detail-table ${
                  round.type === "day20" ? "detail-table--day20" : ""
                }`}
                role="table"
              >
                <div className="detail-table__head" role="row">
                  <span>출력 순서</span>
                  {round.type === "day10" ? (
                    <span>포함</span>
                  ) : (
                    <>
                      <span>구청</span>
                      <span>재단</span>
                    </>
                  )}
                  <span>프로그램명</span>
                  <span>대상</span>
                  <span>일정</span>
                  <span>장소</span>
                  <span>오류·경고</span>
                  <span>작업</span>
                </div>
                {selected.programs.map((program) => (
                  <div className="detail-row" key={program.id} role="row">
                    <span
                      className={`order-cell ${
                        round.type === "day20" ? "order-cell--stacked" : ""
                      }`}
                    >
                      {round.type === "day10" ? (
                        <OrderControl
                          busy={busy}
                          field="outputOrder"
                          label=""
                          onMove={moveOutputOrder}
                          program={program}
                          programs={selected.programs}
                        />
                      ) : (
                        <>
                          <OrderControl
                            busy={busy}
                            field="outputOrderCity"
                            label="구청"
                            onMove={moveOutputOrder}
                            program={program}
                            programs={selected.programs}
                          />
                          <OrderControl
                            busy={busy}
                            field="outputOrderFoundation"
                            label="재단"
                            onMove={moveOutputOrder}
                            program={program}
                            programs={selected.programs}
                          />
                        </>
                      )}
                    </span>
                    {round.type === "day10" ? (
                      <span>
                        <input
                          type="checkbox"
                          checked={program.included}
                          onChange={() =>
                            toggleIncluded(program.id, "included")
                          }
                          aria-label={`${program.title} 출력 포함`}
                        />
                      </span>
                    ) : (
                      <>
                        <span>
                          <input
                            type="checkbox"
                            checked={program.includeCity}
                            onChange={() =>
                              toggleIncluded(program.id, "includeCity")
                            }
                            aria-label={`${program.title} 구청 출력 포함`}
                          />
                        </span>
                        <span>
                          <input
                            type="checkbox"
                            checked={program.includeFoundation}
                            onChange={() =>
                              toggleIncluded(program.id, "includeFoundation")
                            }
                            aria-label={`${program.title} 재단 출력 포함`}
                          />
                        </span>
                      </>
                    )}
                    <strong>{program.title}</strong>
                    <span>{program.audience}</span>
                    <span>{program.startDate}</span>
                    <span>{program.location}</span>
                    <span className={program.warnings.length ? "text-error" : ""}>
                      {program.warnings[0] ?? "-"}
                    </span>
                    <span className="program-actions">
                      <button
                        className="inline-action"
                        disabled={busy}
                        onClick={() => openProgramEditor(program)}
                        title="프로그램 내용을 직접 수정합니다."
                        type="button"
                      >
                        <Pencil size={14} />
                        직접 수정
                      </button>
                      <button
                        className="inline-action text-error"
                        disabled={busy}
                        onClick={() => void deleteProgram(program)}
                        title="프로그램을 시트에서도 완전히 삭제합니다."
                        type="button"
                      >
                        <Trash2 size={14} />
                        프로그램 삭제
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {adminView === "history" ? (
        <aside className="output-panel">
          {adminView === "history" ? (
            <div className="output-history">
              <div className="preview-heading">
                <strong>생성된 HWPX</strong>
                <span>{roundGeneratedFiles.length}개</span>
              </div>
              {roundGeneratedFiles.length ? (
                <div className="generated-file-list">
                  {roundGeneratedFiles.map((file) => (
                    <article className="generated-file-card" key={file.id}>
                      <div>
                        <strong>{file.fileName}</strong>
                        <span>
                          v{file.version} · {documentTypeLabel(file.documentType)}
                        </span>
                        <time dateTime={file.generatedAt}>
                          {formatHistoryTime(file.generatedAt)}
                        </time>
                      </div>
                      <button
                        aria-label={`${file.fileName} 재다운로드`}
                        className="icon-button"
                        disabled={busy}
                        onClick={() => void onDownloadGeneratedFile(file.id)}
                        title="Drive에 보관된 파일을 다시 다운로드합니다."
                        type="button"
                      >
                        <Download size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="history-empty">
                  이 회차에서 생성된 HWPX 파일이 없습니다.
                </p>
              )}
              <div className="history-audit">
                <strong>최근 작업 기록</strong>
                {recentAudit.length ? (
                  <ol>
                    {recentAudit.map((entry) => (
                      <li key={entry.id}>
                        <span>{auditActionLabel(entry.action)}</span>
                        <time dateTime={entry.at}>
                          {formatHistoryTime(entry.at)}
                        </time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="history-empty">표시할 작업 기록이 없습니다.</p>
                )}
              </div>
            </div>
          ) : (
            <>
          <div className="preview-heading">
            <strong>출력 문서 미리보기</strong>
            <button
              className="icon-button"
              disabled={busy}
              onClick={() => void previewHwpx()}
              title="현재 출력 조건으로 HTML 미리보기를 새로고침합니다."
              type="button"
            >
              <RotateCw size={16} />
            </button>
          </div>
          <article className="document-preview">
            <header>
              <small>노원구립도서관</small>
              <strong>
                {hwpxPreview?.title ??
                  `${formatTargetMonth(round.targetMonth)} ${collectionReportTitle(
                    round.type,
                  )}`}
              </strong>
              <span>
                {hwpxPreview
                  ? `출력 대상 ${hwpxPreview.programCount}건`
                  : "아래 버튼을 눌러 실제 출력 데이터를 확인하세요."}
              </span>
            </header>
            {hwpxPreview ? (
              hwpxPreview.programs.length ? (
                <div className="document-preview-table" role="table">
                  <div className="document-preview-row is-header" role="row">
                    <span>도서관</span>
                    <span>프로그램</span>
                    <span>일시·장소</span>
                    <span>대상·내용</span>
                  </div>
                  {hwpxPreview.programs.map((program, index) => (
                    <div
                      className="document-preview-row"
                      key={`${program.libraryAbbreviation}-${program.title}-${index}`}
                      role="row"
                    >
                      <strong>{program.libraryName}</strong>
                      <span>{program.title}</span>
                      <span>
                        {program.schedule || "미입력"}
                        <small>{program.location || "장소 미입력"}</small>
                      </span>
                      <span>
                        {program.audience || "대상 미입력"}
                        {program.capacity === null
                          ? ""
                          : ` · ${program.capacity}명`}
                        <small>{program.description || "내용 미입력"}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="document-preview-empty">
                  현재 조건에 포함되는 프로그램이 없습니다.
                </p>
              )
            ) : (
              <div className="document-preview-placeholder">
                생성될 HWPX와 같은 데이터 순서로 HTML 표를 표시합니다.
              </div>
            )}
            <footer>사진은 Google Drive에서 확인 후 한컴에서 삽입합니다.</footer>
          </article>
          <div className="output-options">
            <label className="output-document-option">
              <span>출력 문서</span>
              {round.type === "day20" ? (
                <select
                  aria-label="출력 문서"
                  disabled={busy}
                  onChange={(event) => {
                    setDocumentType(
                      event.target.value as HwpxDocumentType,
                    );
                    setHwpxPreview(null);
                    setGeneratedFileName("");
                  }}
                  value={documentType}
                >
                  <option value="day20_city">구청 주요업무추진계획</option>
                  <option value="day20_foundation">재단 월간일정표</option>
                </select>
              ) : (
                <strong>구청 주요업무현황보고</strong>
              )}
            </label>
            <label>
              <span>검토완료 항목만 포함</span>
              <input
                type="checkbox"
                checked={reviewedOnly}
                disabled={busy}
                onChange={(event) => {
                  setReviewedOnly(event.target.checked);
                  setHwpxPreview(null);
                  setGeneratedFileName("");
                }}
              />
            </label>
            <label>
              <span>오류 항목 제외</span>
              <input
                type="checkbox"
                checked={excludeWarnings}
                disabled={busy}
                onChange={(event) => {
                  setExcludeWarnings(event.target.checked);
                  setHwpxPreview(null);
                  setGeneratedFileName("");
                }}
              />
            </label>
          </div>
          <button
            className="button button--secondary output-preview-button"
            disabled={busy}
            onClick={() => void previewHwpx()}
            title="현재 조건의 출력 대상과 파일명을 확인합니다."
            type="button"
          >
            <RotateCw size={17} />
            {busy ? "처리 중…" : "HTML 미리보기"}
          </button>
          <button
            className="button button--primary output-generate-button"
            disabled={busy}
            onClick={() => void generateHwpx()}
            title="현재 조건으로 HWPX 파일을 생성해 다운로드합니다."
            type="button"
          >
            <FileOutput size={18} />
            {busy ? "생성 중…" : "HWPX 생성·다운로드"}
          </button>
          {generatedFileName ? (
            <p className="output-success" role="status">
              <Check size={14} />
              {generatedFileName}
            </p>
          ) : null}
          <p className="output-note">
            <AlertTriangle size={14} />
            이미지 제외 HWPX를 Drive에 자동 보관하고 브라우저에도 내려받습니다.
            사진은 관별 Google Drive 폴더에서 확인해 수동 삽입합니다.
          </p>
            </>
          )}
        </aside>
        ) : null}
      </div>
      )}

      {editDraft ? (
        <div className="modal-backdrop">
          <section
            aria-labelledby="program-edit-dialog-title"
            aria-modal="true"
            className="revision-dialog program-edit-dialog"
            role="dialog"
          >
            <div className="revision-dialog__heading">
              <div>
                <span>관리자 직접 수정</span>
                <h2 id="program-edit-dialog-title">{editDraft.title}</h2>
              </div>
            </div>
            <div className="program-edit-form">
              <label className="field field--wide">
                <span>제목 *</span>
                <select
                  aria-label="제목 말머리"
                  disabled={busy}
                  onChange={(event) =>
                    updateEditDraft({
                      programType: event.target.value as Program["programType"],
                    })
                  }
                  value={editDraft.programType}
                >
                  <option value="행사">행사</option>
                  <option value="강연">강연</option>
                  <option value="전시">전시</option>
                </select>
                <input
                  autoFocus
                  disabled={busy}
                  onChange={(event) =>
                    updateEditDraft({ title: event.target.value })
                  }
                  value={editDraft.title}
                />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>일정 유형 *</span>
                  <select
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({
                        scheduleType: event.target
                          .value as Program["scheduleType"],
                      })
                    }
                    value={editDraft.scheduleType}
                  >
                    <option value="single">단일 일정</option>
                    <option value="range">기간</option>
                    <option value="repeat">반복</option>
                    <option value="multiple">복수 회차</option>
                  </select>
                </label>
                <label className="field">
                  <span>시작일 *</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ startDate: event.target.value })
                    }
                    type="date"
                    value={editDraft.startDate}
                  />
                </label>
                <label className="field">
                  <span>종료일 *</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ endDate: event.target.value })
                    }
                    type="date"
                    value={editDraft.endDate}
                  />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>시작 시간</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ startTime: event.target.value })
                    }
                    type="time"
                    value={editDraft.startTime}
                  />
                </label>
                <label className="field">
                  <span>종료 시간</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ endTime: event.target.value })
                    }
                    type="time"
                    value={editDraft.endTime}
                  />
                </label>
                <label className="field">
                  <span>인원 *</span>
                  <input
                    disabled={busy}
                    min="1"
                    onChange={(event) =>
                      updateEditDraft({
                        capacity: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                    type="number"
                    value={editDraft.capacity ?? ""}
                  />
                </label>
              </div>
              <div className="form-row">
                <label className="field">
                  <span>장소 *</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ location: event.target.value })
                    }
                    value={editDraft.location}
                  />
                </label>
                <label className="field">
                  <span>대상 *</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ audience: event.target.value })
                    }
                    value={editDraft.audience}
                  />
                </label>
                <label className="field">
                  <span>담당자 *</span>
                  <input
                    disabled={busy}
                    onChange={(event) =>
                      updateEditDraft({ managerName: event.target.value })
                    }
                    placeholder="이름만 입력"
                    value={editDraft.managerName}
                  />
                </label>
              </div>
              <label className="field field--wide">
                <span>원문 일정</span>
                <input
                  disabled={busy}
                  onChange={(event) =>
                    updateEditDraft({ scheduleOriginal: event.target.value })
                  }
                  value={editDraft.scheduleOriginal}
                />
              </label>
              <label className="field field--wide">
                <span>주요 내용 *</span>
                <textarea
                  disabled={busy}
                  onChange={(event) =>
                    updateEditDraft({ description: event.target.value })
                  }
                  value={editDraft.description}
                />
              </label>
            </div>
            {!canSaveProgram(editDraft) ? (
              <p className="revision-dialog__notice" role="status">
                필수 항목과 시작일·종료일 순서를 확인해주세요.
              </p>
            ) : null}
            <div className="revision-dialog__actions">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={closeProgramEditor}
                type="button"
              >
                취소
              </button>
              <button
                className="button button--secondary"
                disabled={busy || !canSaveProgram(editDraft)}
                onClick={() => void saveProgramEdit()}
                type="button"
              >
                <Check size={16} />
                {busy ? "저장 중…" : "수정 내용 저장"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {revisionTarget ? (
        <div className="modal-backdrop">
          <section
            aria-labelledby="revision-dialog-title"
            aria-modal="true"
            className="revision-dialog"
            role="dialog"
          >
            <div className="revision-dialog__heading">
              <div>
                <span>수정 요청</span>
                <h2 id="revision-dialog-title">
                  {
                    libraries.find(
                      (item) => item.id === revisionTarget.libraryId,
                    )!.officialName
                  }
                </h2>
              </div>
              <StatusLabel status={revisionTarget.status} />
            </div>
            <label className="revision-dialog__field">
              <span>수정 요청 내용 *</span>
              <textarea
                autoFocus
                disabled={busy}
                maxLength={1000}
                onChange={(event) => setRevisionMessage(event.target.value)}
                placeholder="수정이 필요한 항목과 내용을 구체적으로 입력해주세요."
                rows={6}
                value={revisionMessage}
              />
              <small>{revisionMessage.length}/1000</small>
            </label>
            <p className="revision-dialog__notice">
              요청을 보내면 제출 잠금이 해제되고 해당 도서관에서 다시 수정할 수
              있습니다.
            </p>
            <div className="revision-dialog__actions">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={closeRevisionRequest}
                type="button"
              >
                취소
              </button>
              <button
                className="button button--secondary"
                disabled={
                  busy || !normalizeRevisionMessage(revisionMessage)
                }
                onClick={() => void sendRevisionRequest()}
                type="button"
              >
                <Send size={16} />
                {busy ? "전송 중…" : "수정 요청 보내기"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {reviewTarget ? (
        <div className="modal-backdrop">
          <section
            aria-labelledby="review-dialog-title"
            aria-modal="true"
            className="revision-dialog"
            role="dialog"
          >
            <div className="revision-dialog__heading">
              <div>
                <span>검토 완료</span>
                <h2 id="review-dialog-title">
                  {
                    libraries.find(
                      (item) => item.id === reviewTarget.libraryId,
                    )!.officialName
                  }
                </h2>
              </div>
              <StatusLabel status={reviewTarget.status} />
            </div>
            <p className="revision-dialog__notice">
              선택한 제출자료를 검토 완료 상태로 변경합니다. 이후 수정이
              필요하면 다시 수정 요청을 보낼 수 있습니다.
            </p>
            <div className="revision-dialog__actions">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => setReviewTarget(null)}
                type="button"
              >
                취소
              </button>
              <button
                className="button button--secondary"
                disabled={busy}
                onClick={() => void completeReview()}
                type="button"
              >
                <Check size={16} />
                {busy ? "처리 중…" : "검토 완료 처리"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showMonthDialog ? (
        <div className="modal-backdrop">
          <section
            aria-labelledby="new-month-dialog-title"
            aria-modal="true"
            className="revision-dialog"
            role="dialog"
          >
            <div className="revision-dialog__heading">
              <div>
                <span>새 수합 준비</span>
                <h2 id="new-month-dialog-title">대상 월을 선택하세요</h2>
              </div>
              <FilePlus2 size={24} />
            </div>
            <label className="field month-field">
              <span>대상 월</span>
              <input
                autoFocus
                disabled={busy}
                min={round.targetMonth}
                onChange={(event) => setNewTargetMonth(event.target.value)}
                type="month"
                value={newTargetMonth}
              />
            </label>
            <p className="revision-dialog__notice">
              선택한 월의 10일·20일 회차와 9개관 제출함을 준비합니다. 자동으로
              열지 않으며, 준비 후 각 회차의 `수합 열기`를 눌러 개방합니다.
            </p>
            {targetMonths.includes(newTargetMonth) ? (
              <p className="revision-dialog__notice text-error" role="status">
                이미 준비된 대상 월입니다.
              </p>
            ) : null}
            <div className="revision-dialog__actions">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => setShowMonthDialog(false)}
                type="button"
              >
                취소
              </button>
              <button
                className="button button--secondary"
                disabled={
                  busy ||
                  !/^\d{4}-\d{2}$/.test(newTargetMonth) ||
                  targetMonths.includes(newTargetMonth)
                }
                onClick={() => void createMonth()}
                type="button"
              >
                <FilePlus2 size={16} />
                {busy ? "준비 중…" : "10일·20일 회차 준비"}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {collectionStatusTarget ? (
        <div className="modal-backdrop">
          <section
            aria-labelledby="collection-status-dialog-title"
            aria-modal="true"
            className="revision-dialog"
            role="alertdialog"
          >
            <div className="revision-dialog__heading">
              <div>
                <span>수합 상태 변경</span>
                <h2 id="collection-status-dialog-title">
                  {collectionStatusTarget === "closed"
                    ? "수합을 마감하시겠습니까?"
                    : "수합을 다시 여시겠습니까?"}
                </h2>
              </div>
              {collectionStatusTarget === "closed" ? (
                <LockKeyhole size={24} />
              ) : (
                <UnlockKeyhole size={24} />
              )}
            </div>
            <p className="revision-dialog__notice">
              {formatTargetMonth(round.targetMonth)}{" "}
              {collectionTypeLabel(round.type)}을
              {collectionStatusTarget === "closed"
                ? ` 마감하면 작성중 ${summary.draft ?? 0}개관과 수정요청 ${
                    summary.revision_requested ?? 0
                  }개관은 저장·제출할 수 없습니다.`
                : " 다시 열면 작성중·수정요청 상태의 제출자가 저장하고 제출할 수 있습니다."}
            </p>
            <div className="revision-dialog__actions">
              <button
                className="button button--outline"
                disabled={busy}
                onClick={() => setCollectionStatusTarget(null)}
                type="button"
              >
                취소
              </button>
              <button
                className="button button--secondary"
                disabled={busy}
                onClick={() => void confirmCollectionStatusChange()}
                type="button"
              >
                {collectionStatusTarget === "closed" ? (
                  <LockKeyhole size={16} />
                ) : (
                  <UnlockKeyhole size={16} />
                )}
                {busy
                  ? "처리 중…"
                  : collectionStatusTarget === "closed"
                    ? "수합 마감 확인"
                    : "수합 열기 확인"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function documentTypeLabel(type: GeneratedFile["documentType"]): string {
  if (type === "day10_city") return "10일 구청";
  if (type === "day20_city") return "20일 구청";
  return "20일 재단";
}

function formatHistoryTime(value: string): string {
  if (!value) return "시각 없음";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    store_generated_file: "HWPX 생성·보관",
    save_submission: "제출 자료 저장",
    submit_submission: "자료 제출",
    request_revision: "보완 요청",
    complete_review: "검토 완료",
    set_collection_status: "수합 상태 변경",
    create_collection_month: "새 대상 월 준비",
  };
  return labels[action] ?? action;
}

function nextTargetMonth(targetMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(targetMonth);
  if (!match) return targetMonth;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]), 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}`;
}
