import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  FileOutput,
  GripVertical,
  Pencil,
  RotateCw,
  Search,
  Send,
} from "lucide-react";
import { useMemo, useState } from "react";
import { formatDeadline } from "../../domain/deadline";
import type { Submission } from "../../domain/types";
import { libraries } from "../../data/libraryMaster";
import { StatusLabel } from "../../components/StatusLabel";

interface AdminDashboardProps {
  submissions: Submission[];
  deadline: string;
  onSave: (submission: Submission) => void;
}

export function AdminDashboard({
  submissions,
  deadline,
  onSave,
}: AdminDashboardProps) {
  const [selectedId, setSelectedId] = useState(submissions[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const selected = submissions.find((item) => item.id === selectedId);
  const summary = useMemo(
    () =>
      submissions.reduce<Record<string, number>>((result, submission) => {
        result[submission.status] = (result[submission.status] ?? 0) + 1;
        return result;
      }, {}),
    [submissions],
  );
  const filtered = submissions.filter((submission) => {
    const library = libraries.find((item) => item.id === submission.libraryId);
    return library?.officialName.includes(query);
  });

  function updateSelected(patch: Partial<Submission>) {
    if (!selected) return;
    onSave({
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

  function toggleIncluded(programId: string) {
    if (!selected) return;
    updateSelected({
      programs: selected.programs.map((program) =>
        program.id === programId
          ? { ...program, included: !program.included }
          : program,
      ),
    });
  }

  return (
    <section className="workspace admin-workspace">
      <div className="admin-topline">
        <div>
          <h1>수합 관리자</h1>
          <p>관별 제출자료를 검토하고 HWPX 출력 대상을 확정합니다.</p>
        </div>
        <div className="admin-selectors">
          <button className="selector">
            <CalendarDays size={17} />
            2026년 8월
            <ChevronDown size={16} />
          </button>
          <button className="selector">
            10일 수합
            <ChevronDown size={16} />
          </button>
          <span className="deadline-chip">
            제출 마감 {formatDeadline(deadline)}
          </span>
          <button className="icon-button" title="새로고침">
            <RotateCw size={18} />
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

      <div className="admin-grid">
        <div className="admin-primary">
          <div className="table-tools">
            <button className="selector">
              전체 상태
              <ChevronDown size={16} />
            </button>
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
                    onClick={() =>
                      updateSelected({
                        status: "revision_requested",
                        reviewNote: "수합 관리자 수정 요청",
                      })
                    }
                  >
                    <Send size={15} />
                    수정 요청
                  </button>
                  <button
                    className="button button--outline button--small"
                    onClick={() =>
                      updateSelected({
                        status: "reviewed",
                      })
                    }
                  >
                    <Check size={15} />
                    검토 완료
                  </button>
                </div>
              </div>
              <div className="detail-table" role="table">
                <div className="detail-table__head" role="row">
                  <span>순서</span>
                  <span>포함</span>
                  <span>프로그램명</span>
                  <span>대상</span>
                  <span>일정</span>
                  <span>장소</span>
                  <span>오류·경고</span>
                  <span>작업</span>
                </div>
                {selected.programs.map((program) => (
                  <div className="detail-row" key={program.id} role="row">
                    <span className="order-cell">
                      <GripVertical size={16} />
                      {program.outputOrder}
                    </span>
                    <span>
                      <input
                        type="checkbox"
                        checked={program.included}
                        onChange={() => toggleIncluded(program.id)}
                        aria-label={`${program.title} 출력 포함`}
                      />
                    </span>
                    <strong>{program.title}</strong>
                    <span>{program.audience}</span>
                    <span>{program.startDate}</span>
                    <span>{program.location}</span>
                    <span className={program.warnings.length ? "text-error" : ""}>
                      {program.warnings[0] ?? "-"}
                    </span>
                    <button
                      className="inline-action"
                      onClick={() =>
                        updateSelected({
                          reviewNote: `${program.title} 직접 수정`,
                        })
                      }
                    >
                      <Pencil size={14} />
                      직접 수정
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="output-panel">
          <div className="output-panel__tabs">
            <button className="is-active">출력</button>
            <button>작업 이력</button>
          </div>
          <div className="preview-heading">
            <strong>HWPX 미리보기</strong>
            <button className="icon-button">
              <RotateCw size={16} />
            </button>
          </div>
          <div className="document-preview">
            <small>2026년 8월 10일 수합</small>
            <strong>노원구립도서관</strong>
            <b>주요 업무 현황 보고</b>
            <span>2026. 8.</span>
          </div>
          <div className="output-options">
            <label>
              <span>검토완료 항목만 포함</span>
              <input type="checkbox" defaultChecked />
            </label>
            <label>
              <span>오류 항목 제외</span>
              <input type="checkbox" />
            </label>
          </div>
          <button className="button button--secondary output-preview-button">
            <Eye size={17} />
            HWPX 미리보기
          </button>
          <button className="button button--primary output-generate-button">
            <FileOutput size={18} />
            HWPX 생성
          </button>
          <p className="output-note">
            <AlertTriangle size={14} />
            운영 템플릿 저장소 연결 후 실제 파일이 생성됩니다.
          </p>
        </aside>
      </div>
    </section>
  );
}

