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
} from "lucide-react";
import { useMemo, useState } from "react";
import { canSubmitterEdit, formatDeadline } from "../../domain/deadline";
import type { Program, Submission } from "../../domain/types";
import { StatusLabel } from "../../components/StatusLabel";

interface SubmitterDashboardProps {
  submission: Submission;
  deadline: string;
  onSave: (submission: Submission) => void;
  onSubmit: (submission: Submission) => void;
}

function blankProgram(index: number): Program {
  return {
    id: crypto.randomUUID(),
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
    description: "",
    included: true,
    outputOrder: index,
    warnings: ["필수 입력항목을 확인해주세요."],
  };
}

export function SubmitterDashboard({
  submission,
  deadline,
  onSave,
  onSubmit,
}: SubmitterDashboardProps) {
  const [draft, setDraft] = useState(submission);
  const [selectedId, setSelectedId] = useState(
    submission.programs[0]?.id ?? "",
  );
  const editable = canSubmitterEdit(draft.status);
  const selected = useMemo(
    () => draft.programs.find((program) => program.id === selectedId),
    [draft.programs, selectedId],
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

  return (
    <section className="workspace">
      <div className="workspace-heading submitter-heading">
        <div>
          <h1>2026년 8월</h1>
          <p>10일 수합 · 주요 업무 현황 보고</p>
        </div>
        <div className="heading-facts">
          <div>
            <span>제출 상태</span>
            <StatusLabel status={draft.status} />
          </div>
          <div>
            <span>마감</span>
            <strong>
              <Clock3 size={18} />
              {formatDeadline(deadline)}
            </strong>
          </div>
        </div>
      </div>

      {!editable ? (
        <div className="locked-notice">
          <LockKeyhole size={18} />
          제출이 완료되어 수정할 수 없습니다. 수정이 필요하면 수합 관리자에게
          요청해주세요.
        </div>
      ) : null}

      <div className="drive-photo-notice">
        <FolderOpen size={19} />
        <div>
          <strong>사진은 Google Drive로 별도 제출합니다.</strong>
          <span>이 화면에서는 문서에 들어갈 텍스트 자료만 입력해주세요.</span>
        </div>
      </div>

      <div className="workspace-toolbar">
        <button className="button button--outline" onClick={addProgram}>
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
            <label className="field field--wide">
              <span>사업·행사명 *</span>
              <input
                value={selected.title}
                disabled={!editable}
                onChange={(event) => updateProgram({ title: event.target.value })}
              />
            </label>
            <div className="form-row">
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
              <label className="field field--small">
                <span>시작</span>
                <input
                  type="time"
                  value={selected.startTime}
                  disabled={!editable}
                  onChange={(event) =>
                    updateProgram({ startTime: event.target.value })
                  }
                />
              </label>
              <label className="field field--small">
                <span>종료</span>
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
            <label className="field field--wide">
              <span>장소 *</span>
              <input
                value={selected.location}
                disabled={!editable}
                onChange={(event) =>
                  updateProgram({ location: event.target.value })
                }
              />
            </label>
            <div className="form-row">
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
              <label className="field field--small">
                <span>인원</span>
                <input
                  type="number"
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
            </div>
            <label className="field field--wide">
              <span>주요 내용 *</span>
              <textarea
                value={selected.description}
                disabled={!editable}
                onChange={(event) =>
                  updateProgram({ description: event.target.value })
                }
              />
            </label>
          </div>
        ) : null}
      </div>

      <div className="sticky-actionbar">
        <div className={warningCount ? "validation-message" : "success-message"}>
          {warningCount ? <AlertCircle size={24} /> : <CalendarDays size={24} />}
          <div>
            <strong>
              {warningCount
                ? `입력 확인이 필요한 항목 ${warningCount}건`
                : "제출할 수 있습니다"}
            </strong>
            <span>
              {warningCount
                ? "필수항목을 확인해주세요."
                : "입력한 내용을 최종 확인해주세요."}
            </span>
          </div>
        </div>
        <div className="actionbar-buttons">
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
        </div>
      </div>
    </section>
  );
}
