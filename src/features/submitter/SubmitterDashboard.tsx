import {
  AlertCircle,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  FolderOpen,
  LockKeyhole,
  Plus,
  Save,
  Send,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  collectionReportTitle,
  collectionTypeLabel,
  formatTargetMonth,
} from "../../domain/collections";
import {
  canSubmitterEdit,
  formatDeadline,
} from "../../domain/deadline";
import { collectionStatusLabels } from "../../domain/collectionStatus";
import type { CollectionRound, Program, Submission } from "../../domain/types";
import { StatusLabel } from "../../components/StatusLabel";
import { canSaveProgram } from "../admin/programEditing";

interface SubmitterDashboardProps {
  submission: Submission;
  round: CollectionRound;
  onSave: (submission: Submission) => Promise<boolean>;
  onSubmit: (submission: Submission) => void;
}

function blankProgram(index: number): Program {
  return {
    id: crypto.randomUUID(),
    programType: "행사",
    title: `새 행사 ${index}`,
    scheduleType: "single",
    startDate: "2026-08-01",
    startTime: "10:00",
    endDate: "2026-08-01",
    endTime: "12:00",
    scheduleOriginal: "",
    location: "",
    audience: "",
    capacity: null,
    managerName: "",
    description: "",
    included: true,
    outputOrder: index,
    includeCity: true,
    includeFoundation: true,
    outputOrderCity: index,
    outputOrderFoundation: index,
    warnings: ["필수 입력항목을 확인해주세요."],
  };
}

export function SubmitterDashboard({
  submission,
  round,
  onSave,
  onSubmit,
}: SubmitterDashboardProps) {
  const photoDriveUrl = import.meta.env.VITE_PHOTO_DRIVE_URL;
  const [draft, setDraft] = useState(submission);
  const [selectedId, setSelectedId] = useState(
    submission.programs[0]?.id ?? "",
  );
  const editable = canSubmitterEdit(
    draft.status,
    round.status,
    round.deadline,
  );
  const collectionOpen = round.status === "open";
  const locked = collectionOpen && !editable;
  const completedEditable =
    editable && ["submitted", "resubmitted"].includes(draft.status);
  const selected = useMemo(
    () => draft.programs.find((program) => program.id === selectedId),
    [draft.programs, selectedId],
  );
  const completedValid = Boolean(
    draft.programs.length && draft.programs.every(canSaveProgram),
  );
  const warningCount = draft.programs.reduce(
    (count, program) => count + program.warnings.length,
    0,
  );

  function updateProgram(patch: Partial<Program>) {
    if (!selected || !editable) return;
    setDraft((current) => ({
      ...current,
      programs: current.programs.map((program) =>
        program.id === selected.id ? { ...program, ...patch } : program,
      ),
      savedAt: new Date().toISOString(),
    }));
  }

  function addProgram() {
    if (!editable) return;
    const nextProgram = blankProgram(draft.programs.length + 1);
    setDraft((current) => ({
      ...current,
      programs: [...current.programs, nextProgram],
    }));
    setSelectedId(nextProgram.id);
  }

  async function deleteProgram() {
    if (!selected || !editable) return;
    const persisted = submission.programs.some(
      (program) => program.id === selected.id,
    );
    const confirmed = window.confirm(
      persisted
        ? "행사를 삭제하면 즉시 반영됩니다. 삭제할까요?"
        : "임시저장하지 않은 행사를 삭제할까요?",
    );
    if (!confirmed) return;

    const previous = draft;
    const programs = draft.programs.filter(
      (program) => program.id !== selected.id,
    );
    const next = { ...draft, programs, savedAt: new Date().toISOString() };
    setDraft(next);
    setSelectedId(programs[0]?.id ?? "");

    if (persisted && !(await onSave(next))) {
      setDraft(previous);
      setSelectedId(selected.id);
    }
  }

  return (
    <section className="workspace">
      <div className="workspace-heading submitter-heading">
        <div>
          <h1>{formatTargetMonth(round.targetMonth)}</h1>
          <p>
            {collectionTypeLabel(round.type)} ·{" "}
            {collectionReportTitle(round.type)}
          </p>
        </div>
        <div className="heading-facts">
          <div>
            <span>제출 상태</span>
            <StatusLabel status={draft.status} />
          </div>
          <div>
            <span>수합 상태</span>
            <strong className={`collection-status-text is-${round.status}`}>
              {collectionStatusLabels[round.status]}
            </strong>
          </div>
          <div>
            <span>마감</span>
            <strong>
              <Clock3 size={18} />
              {formatDeadline(round.deadline)}
            </strong>
          </div>
        </div>
      </div>

      {!collectionOpen ? (
        <div className="locked-notice collection-locked-notice" role="status">
          <LockKeyhole size={18} />
          {round.status === "planned"
            ? "아직 수합이 열리지 않아 저장·제출할 수 없습니다."
            : round.status === "archived"
              ? "보관된 수합 회차이므로 저장·제출할 수 없습니다."
              : "현재 수합이 마감되어 저장·제출할 수 없습니다. 관리자가 다시 열면 작성 중인 자료를 계속 편집할 수 있습니다."}
        </div>
      ) : completedEditable ? (
        <div className="revision-notice" role="status">
          <CalendarDays size={18} />
          <div>
            <strong>제출 완료 자료는 마감 전까지 수정할 수 있습니다.</strong>
            <span>수정 저장 즉시 관리자 화면에 반영됩니다.</span>
          </div>
        </div>
      ) : !editable ? (
        <div className="locked-notice">
          <LockKeyhole size={18} />
          {draft.status === "reviewed"
            ? "관리자 검토가 완료되어 수정할 수 없습니다."
            : "제출 마감 후에는 관리자 수정 요청이 있어야 수정할 수 있습니다."}
        </div>
      ) : null}

      {draft.status === "revision_requested" ? (
        <div className="revision-notice" role="status">
          <AlertCircle size={18} />
          <div>
            <strong>관리자가 수정을 요청했습니다.</strong>
            <span>
              {draft.reviewNote ||
                "수정 요청 내용을 확인한 뒤 자료를 보완해 다시 제출해주세요."}
            </span>
          </div>
        </div>
      ) : null}

      <div className="drive-photo-notice">
        <FolderOpen size={19} />
        <div>
          <strong>사진은 Google Drive로 별도 제출합니다.</strong>
          <span>
            폴더 안의 파일명 규칙을 확인한 뒤 사진을 업로드해주세요.{" "}
            {photoDriveUrl ? (
              <a href={photoDriveUrl} rel="noreferrer" target="_blank">
                사진 업로드 폴더 열기
              </a>
            ) : null}
          </span>
        </div>
      </div>

      <div className="workspace-toolbar">
        <button
          className="button button--outline"
          disabled={!editable}
          onClick={addProgram}
        >
          <Plus size={18} />
          행사 추가
        </button>
        <span>총 {draft.programs.length}건</span>
      </div>

      <div className="program-editor">
        <div className="program-table" role="table" aria-label="행사 목록">
          <div className="program-table__head" role="row">
            <span>번호</span>
            <span>사업·행사명</span>
            <span>일시</span>
            <span>장소</span>
            <span>대상</span>
            <span />
          </div>
          {draft.programs.map((program, index) => {
            const open = program.id === selectedId;
            return (
              <button
                key={program.id}
                className={`program-row ${open ? "is-open" : ""}`}
                onClick={() => setSelectedId(program.id)}
                role="row"
              >
                <span>{index + 1}</span>
                <strong>{program.title}</strong>
                <span>
                  {program.startDate} {program.startTime}~{program.endTime}
                </span>
                <span>{program.location || "미입력"}</span>
                <span>
                  {program.audience || "미입력"}
                  {program.capacity ? ` / ${program.capacity}명` : ""}
                </span>
                <span>{open ? <ChevronUp /> : <ChevronDown />}</span>
              </button>
            );
          })}
        </div>

        {selected ? (
          <div className="program-form">
            <section className="form-section">
              <div className="section-heading">
                <h2>기본 정보</h2>
                <button
                  className="button button--secondary button--small text-error"
                  disabled={!editable}
                  onClick={() => void deleteProgram()}
                  type="button"
                >
                  <Trash2 size={16} />
                  행사 삭제
                </button>
              </div>
              <label className="field field--wide">
                <span>제목 *</span>
                <select
                  aria-label="제목 말머리"
                  disabled={!editable}
                  onChange={(event) =>
                    updateProgram({
                      programType: event.target.value as Program["programType"],
                    })
                  }
                  value={selected.programType}
                >
                  <option value="행사">행사</option>
                  <option value="강연">강연</option>
                  <option value="전시">전시</option>
                </select>
                <input
                  value={selected.title}
                  disabled={!editable}
                  placeholder="제목"
                  onChange={(event) =>
                    updateProgram({ title: event.target.value })
                  }
                />
              </label>
            </section>
            <section className="form-section">
              <h2>일정</h2>
              <div className="form-grid form-grid--schedule">
                <label className="field">
                  <span>일정 유형 *</span>
                  <select
                    aria-label="일정 유형"
                    value={selected.scheduleType}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({
                        scheduleType: event.target
                          .value as Program["scheduleType"],
                      })
                    }
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
                    type="date"
                    value={selected.startDate}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ startDate: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>종료일 *</span>
                  <input
                    type="date"
                    value={selected.endDate}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ endDate: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>시작 시간</span>
                  <input
                    type="time"
                    value={selected.startTime}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ startTime: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>종료 시간</span>
                  <input
                    type="time"
                    value={selected.endTime}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ endTime: event.target.value })
                    }
                  />
                </label>
              </div>
            </section>
            <section className="form-section">
              <h2>운영 정보</h2>
              <div className="form-grid form-grid--operations">
                <label className="field">
                  <span>장소 *</span>
                  <input
                    value={selected.location}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ location: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>대상 *</span>
                  <input
                    value={selected.audience}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ audience: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>인원 *</span>
                  <input
                    type="number"
                    min="1"
                    value={selected.capacity ?? ""}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({
                        capacity: event.target.value
                          ? Number(event.target.value)
                          : null,
                      })
                    }
                  />
                </label>
                <label className="field">
                  <span>담당자 *</span>
                  <input
                    value={selected.managerName}
                    disabled={!editable}
                    onChange={(event) =>
                      updateProgram({ managerName: event.target.value })
                    }
                    placeholder="이름만 입력"
                  />
                </label>
              </div>
            </section>
            <section className="form-section">
              <h2>개요</h2>
              <label className="field field--wide">
                <span className="sr-only">주요 내용 *</span>
                <textarea
                  value={selected.description}
                  disabled={!editable}
                  onChange={(event) =>
                    updateProgram({ description: event.target.value })
                  }
                />
              </label>
            </section>
          </div>
        ) : null}
      </div>

      <div className="sticky-actionbar">
        <div
          className={
            locked || (completedEditable && !completedValid)
              ? "validation-message"
              : warningCount && !completedEditable
                ? "validation-message"
                : "success-message"
          }
        >
          {locked ||
          (completedEditable && !completedValid) ||
          (warningCount && !completedEditable) ? (
            <AlertCircle size={24} />
          ) : (
            <CalendarDays size={24} />
          )}
          <div>
            <strong>
              {!collectionOpen
                ? `${collectionStatusLabels[round.status]} 상태입니다`
                : locked
                  ? draft.status === "reviewed"
                    ? "관리자에 의해 검토가 완료된 자료는 신규 프로그램을 별도 추가할 수 없습니다"
                    : "현재 상태에서는 제출할 수 없습니다"
                : completedEditable && !completedValid
                  ? "수정한 자료의 필수항목을 확인해주세요"
                : completedEditable
                  ? "마감 전까지 제출 내용을 수정할 수 있습니다"
                : warningCount
                ? `입력 확인이 필요한 항목 ${warningCount}건`
                : "제출할 수 있습니다"}
            </strong>
            <span>
              {!collectionOpen
                ? "관리자가 수합을 다시 열기 전까지 저장·제출할 수 없습니다."
                : locked
                  ? draft.status === "reviewed"
                    ? "추가 필요시 담당자에게 문의하세요."
                    : "변경이 필요하면 수합 관리자에게 요청해주세요."
                : completedEditable
                  ? "수정 내용 저장 즉시 관리자 화면에 반영됩니다."
                : warningCount
                ? "필수항목을 확인해주세요."
                : "입력한 내용을 최종 확인해주세요."}
            </span>
          </div>
        </div>
        <div className="actionbar-buttons">
          {completedEditable ? (
            <button
              className="button button--primary"
              disabled={!completedValid}
              onClick={() => void onSave(draft)}
            >
              <Save size={18} />
              수정 내용 저장
            </button>
          ) : (
            <>
              <button
                className="button button--secondary"
                disabled={!editable}
                onClick={() => onSave(draft)}
              >
                <Save size={18} />
                임시저장
              </button>
              <button
                className="button button--primary"
                disabled={!editable || warningCount > 0}
                onClick={() => onSubmit(draft)}
              >
                <Send size={18} />
                제출하기
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
