import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Database,
  FileCheck2,
  FolderUp,
  KeyRound,
  RefreshCw,
  Settings2,
} from "lucide-react";
import type {
  AppSnapshot,
  CollectionRound,
  LibraryId,
  Submission,
  SubmissionStatus,
} from "../../domain/types";
import { formatTargetMonth } from "../../domain/collections";
import {
  buildSubmissionHistory,
  formatDateTime,
} from "./operationalPanelsData";

const statusLabels: Record<SubmissionStatus, string> = {
  draft: "작성중",
  submitted: "제출완료",
  late: "지연제출",
  revision_requested: "수정요청",
  resubmitted: "재제출",
  reviewed: "검토완료",
};

export function AdminSettingsPanel({
  busy,
  snapshot,
  onRefresh,
}: {
  busy: boolean;
  snapshot: AppSnapshot;
  onRefresh: () => void;
}) {
  return (
    <section className="operational-page" aria-labelledby="settings-title">
      <header className="operational-page__heading">
        <div>
          <span>운영 설정</span>
          <h1 id="settings-title">연결 상태와 운영 기준</h1>
          <p>
            민감한 비밀값은 표시하지 않고 현재 불러온 운영 데이터와 적용 기준만
            확인합니다.
          </p>
        </div>
        <button
          className="button button--primary"
          disabled={busy}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCw size={16} />
          {busy ? "새로고침 중…" : "운영 데이터 새로고침"}
        </button>
      </header>

      <div className="operational-metrics">
        <article>
          <span>수합 회차</span>
          <strong>{snapshot.rounds.length}개</strong>
        </article>
        <article>
          <span>관별 제출자료</span>
          <strong>{snapshot.submissions.length}건</strong>
        </article>
        <article>
          <span>생성 파일 이력</span>
          <strong>{snapshot.generatedFiles.length}개</strong>
        </article>
      </div>

      <div className="operational-card-grid">
        <article className="operational-card">
          <span className="operational-card__icon">
            <KeyRound size={20} />
          </span>
          <div>
            <h2>계정 정책</h2>
            <p>
              도서관 계정은 도서관명 영문 ID와 숫자 4자리 비밀번호를 사용합니다.
              관리 계정과 실제 비밀번호는 Netlify 환경변수에서만 관리합니다.
            </p>
          </div>
        </article>
        <article className="operational-card">
          <span className="operational-card__icon">
            <Database size={20} />
          </span>
          <div>
            <h2>데이터 연결</h2>
            <p>
              화면은 Netlify Function을 거쳐 Apps Script Web App과 Google
              Sheets·Drive에 연결됩니다. 브라우저는 상류 주소나 서비스 비밀값을
              직접 알지 못합니다.
            </p>
          </div>
        </article>
        <article className="operational-card">
          <span className="operational-card__icon">
            <FileCheck2 size={20} />
          </span>
          <div>
            <h2>문서·사진 정책</h2>
            <p>
              통합 문서는 HWPX로만 생성하며 사진은 안내된 Google Drive 폴더로
              별도 제출합니다. 원본 HWP 파일은 수합하지 않습니다.
            </p>
          </div>
        </article>
      </div>
    </section>
  );
}

export function SubmitterHistoryPanel({
  libraryId,
  rounds,
  submissions,
  onOpenRound,
}: {
  libraryId: LibraryId;
  rounds: CollectionRound[];
  submissions: Submission[];
  onOpenRound: (round: CollectionRound) => void;
}) {
  const entries = buildSubmissionHistory(rounds, submissions, libraryId);

  return (
    <section className="operational-page" aria-labelledby="history-title">
      <header className="operational-page__heading">
        <div>
          <span>제출 내역</span>
          <h1 id="history-title">회차별 저장·제출 상태</h1>
          <p>현재 계정에 연결된 회차만 표시합니다.</p>
        </div>
      </header>
      <div className="submission-history-list">
        {entries.map(({ round, submission }) => (
          <article className="submission-history-card" key={round.id}>
            <div>
              <span>{formatTargetMonth(round.targetMonth)}</span>
              <h2>{round.title}</h2>
              <p>
                프로그램 {submission?.programs.length ?? 0}건 · 마지막 저장{" "}
                {submission ? formatDateTime(submission.savedAt) : "-"}
              </p>
              {submission?.reviewNote ? (
                <small>관리자 안내: {submission.reviewNote}</small>
              ) : null}
            </div>
            <div className="submission-history-card__actions">
              <span
                className={`status-pill status-pill--${
                  submission?.status ?? "draft"
                }`}
              >
                {submission
                  ? statusLabels[submission.status]
                  : "자료 없음"}
              </span>
              <button
                className="button button--outline button--small"
                onClick={() => onOpenRound(round)}
                type="button"
              >
                작성 화면 열기
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function HelpPanel() {
  return (
    <section className="operational-page" aria-labelledby="help-title">
      <header className="operational-page__heading">
        <div>
          <span>이용 안내</span>
          <h1 id="help-title">문화프로그램 수합 방법</h1>
          <p>임시저장부터 수정 요청 대응까지 순서대로 진행합니다.</p>
        </div>
      </header>
      <ol className="guide-steps">
        <li>
          <span><Settings2 size={20} /></span>
          <div>
            <h2>통합 수합 선택</h2>
            <p>사이드바에서 통합 수합을 선택합니다. 한 번 제출한 내용으로 3종 문서를 생성합니다.</p>
          </div>
        </li>
        <li>
          <span><BookOpenCheck size={20} /></span>
          <div>
            <h2>프로그램 작성·임시저장</h2>
            <p>
              제목 말머리([행사]·[강연]·[전시]), 개요, 일시, 장소, 대상·인원,
              담당자 이름을 입력하고 수시로 임시저장합니다.
            </p>
          </div>
        </li>
        <li>
          <span><FolderUp size={20} /></span>
          <div>
            <h2>사진은 Drive로 별도 제출</h2>
            <p>
              사진은 화면에 첨부하지 않고 안내된 Google Drive 폴더에 올립니다.
            </p>
          </div>
        </li>
        <li>
          <span><CheckCircle2 size={20} /></span>
          <div>
            <h2>오류 확인 후 제출</h2>
            <p>
              필수값과 경고를 확인한 뒤 제출합니다. 마감 전에는 제출완료
              자료도 직접 수정할 수 있고, 마감 후에는 관리자 수정 요청이
              있어야 다시 편집할 수 있습니다.
            </p>
          </div>
        </li>
        <li>
          <span><Clock3 size={20} /></span>
          <div>
            <h2>제출 내역 확인</h2>
            <p>
              제출 내역에서 회차별 상태와 관리자 안내를 확인하고 해당 작성
              화면으로 돌아갈 수 있습니다.
            </p>
          </div>
        </li>
      </ol>
    </section>
  );
}
