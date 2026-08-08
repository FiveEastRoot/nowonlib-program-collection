import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LogOut, RefreshCw } from "lucide-react";
import { AppShell, type AdminView } from "./components/AppShell";
import { libraries } from "./data/libraryMaster";
import { createDemoMonth, createDemoSnapshot } from "./data/demo";
import {
  readDemoCollectionStatuses,
  writeDemoCollectionStatus,
} from "./data/demoCollectionStatus";
import type {
  AppSnapshot,
  CollectionStatus,
  CollectionType,
  LibraryId,
  Program,
  Submission,
} from "./domain/types";
import { AdminDashboard } from "./features/admin/AdminDashboard";
import {
  readTargetMonthPreference,
  writeTargetMonthPreference,
} from "./features/admin/targetMonthPreference";
import { LoginScreen } from "./features/auth/LoginScreen";
import { SubmitterDashboard } from "./features/submitter/SubmitterDashboard";
import {
  AdminSettingsPanel,
  HelpPanel,
  SubmitterHistoryPanel,
} from "./features/common/OperationalPanels";
import {
  AuthClient,
  AuthClientError,
  type AuthSession,
} from "./storage/authClient";
import {
  RemoteCollectionApi,
  RemoteRepositoryError,
} from "./storage/remoteRepository";
import {
  HwpxClient,
  HwpxClientError,
  type HwpxPreview,
  type HwpxRequest,
} from "./storage/hwpxClient";

const authClient = new AuthClient();
const repository = new RemoteCollectionApi();
const hwpxClient = new HwpxClient();
const demoScenario = import.meta.env.DEV
  ? new URLSearchParams(window.location.search).get("demo")
  : null;
const demoLibraryId = (
  import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get("library")
    : null
) as LibraryId | null;
const demoSubmitterLibrary =
  libraries.find((library) => library.id === demoLibraryId)?.id ??
  "nowon-central";
const demoMode =
  demoScenario === "admin" ||
  demoScenario === "submitter" ||
  demoScenario === "load-error";
const demoLoadError = demoScenario === "load-error";
const demoLoadErrorMessage =
  "운영 데이터 응답 시간이 15초를 초과했습니다. 네트워크 또는 Apps Script 상태를 확인해주세요.";

export default function App() {
  const [session, setSession] = useState<AuthSession | null | undefined>(
    demoMode
      ? {
          role: demoScenario === "submitter" ? "submitter" : "admin",
          actorRef:
            demoScenario === "submitter"
              ? `account-${demoSubmitterLibrary}`
              : "account-admin",
          libraryId:
            demoScenario === "submitter" ? demoSubmitterLibrary : undefined,
          expiresAt: "2099-12-31T23:59:59+09:00",
        }
      : undefined,
  );
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(() =>
    demoScenario === "admin" || demoScenario === "submitter"
      ? createDemoSnapshot(
          readDemoCollectionStatuses(window.localStorage),
        )
      : null,
  );
  const [error, setError] = useState(
    demoLoadError ? demoLoadErrorMessage : "",
  );
  const [busy, setBusy] = useState(false);
  const [roundType, setRoundType] = useState<CollectionType>("monthly");
  const [targetMonth, setTargetMonth] = useState(() =>
    readTargetMonthPreference(window.localStorage),
  );
  const [adminView, setAdminView] = useState<AdminView>("collection");
  const selectedRound = useMemo(
    () => {
      const matchingRounds = (snapshot?.rounds ?? [])
        .filter((round) => round.type === roundType)
        .sort((left, right) =>
          right.targetMonth.localeCompare(left.targetMonth),
        );
      return (
        matchingRounds.find((round) => round.targetMonth === targetMonth) ??
        matchingRounds[0] ??
        (session?.role === "admin" ? snapshot?.rounds[0] : undefined)
      );
    },
    [roundType, session?.role, snapshot, targetMonth],
  );
  const submitterSubmission = useMemo(
    () =>
      snapshot?.submissions.find(
        (submission) =>
          submission.libraryId === session?.libraryId &&
          submission.roundId === selectedRound?.id,
      ),
    [selectedRound?.id, session?.libraryId, snapshot],
  );
  const activeSubmissions = useMemo(
    () =>
      snapshot?.submissions.filter(
        (submission) => submission.roundId === selectedRound?.id,
      ) ?? [],
    [selectedRound?.id, snapshot],
  );

  useEffect(() => {
    if (!selectedRound) return;

    writeTargetMonthPreference(
      window.localStorage,
      selectedRound.targetMonth,
    );
  }, [selectedRound]);

  useEffect(() => {
    if (demoMode) return;
    void repository.bootstrap().then(({ session: current, snapshot: data }) => {
      setSession(current);
      setSnapshot(data);
    }).catch((cause: unknown) => {
      if (
        cause instanceof RemoteRepositoryError &&
        ["SESSION_REQUIRED", "SESSION_EXPIRED", "INVALID_SESSION"].includes(
          cause.code,
        )
      ) {
        setSession(null);
        return;
      }
      setError(messageFor(cause));
      setSession(null);
    });
  }, []);

  async function loadSnapshot() {
    setBusy(true);
    setError("");
    if (demoLoadError) {
      window.setTimeout(() => {
        setError(demoLoadErrorMessage);
        setBusy(false);
      }, 300);
      return;
    }
    try {
      setSnapshot(await repository.load());
    } catch (cause) {
      if (
        cause instanceof RemoteRepositoryError &&
        ["SESSION_REQUIRED", "SESSION_EXPIRED", "INVALID_SESSION"].includes(
          cause.code,
        )
      ) {
        setSession(null);
        setSnapshot(null);
      }
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function login(id: string, pin: string) {
    setBusy(true);
    setError("");
    try {
      const nextSession = await authClient.login(id, pin);
      setSession(nextSession);
      setSnapshot(await repository.load());
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setError("");
    try {
      await authClient.logout();
      setSession(null);
      setSnapshot(null);
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveSubmission(submission: Submission): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await repository.saveSubmission(submission));
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(submission: Submission) {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await repository.submitSubmission(submission));
    } catch (cause) {
      setError(messageFor(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deleteProgram(
    submission: Submission,
    program: Program,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await repository.deleteProgram(submission, program));
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function requestRevision(
    submission: Submission,
    message: string,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await repository.requestRevision(submission, message));
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function completeReview(submission: Submission): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      setSnapshot(await repository.completeReview(submission));
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setCollectionStatus(
    collectionId: string,
    status: Extract<CollectionStatus, "open" | "closed">,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      if (demoMode) {
        setSnapshot((current) => {
          if (!current) return current;
          const currentStatuses = Object.fromEntries(
            current.rounds.map((round) => [round.id, round.status]),
          );
          writeDemoCollectionStatus(
            window.localStorage,
            currentStatuses,
            collectionId,
            status,
          );
          return {
            ...current,
            rounds: current.rounds.map((round) =>
              round.id === collectionId ? { ...round, status } : round,
            ),
            auditLog: [
              {
                id: `audit_demo-${crypto.randomUUID()}`,
                at: new Date().toISOString(),
                actor: "account-admin",
                action: "set_collection_status",
                detail: `status=${status}`,
                entityType: "collection",
                entityId: collectionId,
              },
              ...current.auditLog,
            ],
          };
        });
        return true;
      }
      setSnapshot(
        await repository.setCollectionStatus(collectionId, status),
      );
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createCollectionMonth(targetMonth: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      if (demoMode) {
        const created = createDemoMonth(targetMonth);
        setSnapshot((current) =>
          current
            ? {
                ...current,
                rounds: [...current.rounds, ...created.rounds],
                submissions: [...current.submissions, ...created.submissions],
              }
            : current,
        );
      } else {
        setSnapshot(await repository.createCollectionMonth(targetMonth));
      }
      setTargetMonth(targetMonth);
      setRoundType("monthly");
      setAdminView("collection");
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function previewHwpx(
    request: HwpxRequest,
  ): Promise<HwpxPreview | null> {
    setBusy(true);
    setError("");
    try {
      if (demoMode) {
        const previewRound = snapshot?.rounds.find(
          (item) => item.id === request.collectionId,
        );
        if (!previewRound || !snapshot) return null;
        const [year, month] = previewRound.targetMonth.split("-");
        const programs = snapshot.submissions
          .filter((submission) => submission.roundId === request.collectionId)
          .filter(
            (submission) =>
              !request.reviewedOnly || submission.status === "reviewed",
          )
          .flatMap((submission) => {
            const sourceLibrary = libraries.find(
              (item) => item.id === submission.libraryId,
            )!;
            return submission.programs
              .filter((program) => {
                const included =
                  request.documentType === "day10_city"
                    ? program.included
                    : request.documentType === "day20_city"
                      ? program.includeCity
                      : program.includeFoundation;
                return (
                  included &&
                  (!request.excludeWarnings || !program.warnings.length)
                );
              })
              .map((program) => ({
                libraryName: sourceLibrary.officialName,
                libraryAbbreviation: sourceLibrary.officialName,
                title: program.title,
                programType: program.programType,
                schedule:
                  program.scheduleOriginal ||
                  `${program.startDate} ${program.startTime}~${program.endTime}`,
                location: program.location,
                audience: program.audience,
                capacity: program.capacity,
                description: program.description,
                managerName: program.managerName,
              }));
          });
        const title =
          request.documentType === "day10_city"
            ? `${year}년 ${Number(month)}월 주요 업무 현황 보고`
            : request.documentType === "day20_city"
              ? `${Number(month)}월중 주요업무추진계획`
              : `월간일정표 / ${year}. ${Number(month)}.`;
        return {
          title,
          fileName: `${previewRound.targetMonth}_미리보기.hwpx`,
          documentType: request.documentType,
          programCount: programs.length,
          reviewedOnly: request.reviewedOnly,
          excludeWarnings: request.excludeWarnings,
          programs,
          storageStatus: "drive_on_generate",
        };
      }
      return await hwpxClient.preview(request);
    } catch (cause) {
      setError(messageFor(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function generateHwpx(request: HwpxRequest): Promise<string | null> {
    setBusy(true);
    setError("");
    try {
      if (demoMode) {
        const targetMonth =
          snapshot?.rounds.find((item) => item.id === request.collectionId)
            ?.targetMonth ?? "로컬";
        const fileName = `${targetMonth}_${request.documentType}.hwpx`;
        hwpxClient.downloadLocalFixture(fileName);
        return fileName;
      }
      const fileName = await hwpxClient.generate(request);
      setSnapshot(await repository.load());
      return fileName;
    } catch (cause) {
      setError(messageFor(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function downloadGeneratedFile(fileId: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      if (demoMode) {
        const fileName =
          snapshot?.generatedFiles.find((file) => file.id === fileId)
            ?.fileName ?? "로컬_검수.hwpx";
        hwpxClient.downloadLocalFixture(fileName);
        return true;
      }
      await hwpxClient.download(fileId);
      return true;
    } catch (cause) {
      setError(messageFor(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (typeof session === "undefined") {
    return <LoadingScreen message="로그인 상태를 확인하는 중입니다." />;
  }

  if (!session) {
    return <LoginScreen busy={busy} error={error} onLogin={login} />;
  }

  if (!snapshot) {
    return error ? (
      <StartupErrorScreen
        busy={busy}
        message={error}
        onLogout={logout}
        onRetry={loadSnapshot}
      />
    ) : (
      <LoadingScreen message="수합 화면을 불러오는 중입니다." />
    );
  }

  if (!selectedRound) {
    return (
      <div className="loading-screen">
        운영 중인 수합 회차를 찾지 못했습니다.
      </div>
    );
  }

  const library = libraries.find((item) => item.id === session.libraryId);
  const accountName =
    session.role === "admin"
      ? "수합 관리자"
      : (library?.officialName ?? session.libraryId ?? "도서관");

  return (
    <AppShell
      accountName={accountName}
      adminView={adminView}
      busy={busy}
      roundType={selectedRound.type}
      onLogout={logout}
      onAdminViewChange={setAdminView}
      onRefresh={loadSnapshot}
      onRoundTypeChange={(type) => {
        setError("");
        setRoundType(type);
      }}
      role={session.role}
    >
      {error ? (
        <div className="app-error" role="alert">
          {error}
        </div>
      ) : null}
      {session.role === "submitter" &&
      session.libraryId &&
      adminView === "submission-history" ? (
        <SubmitterHistoryPanel
          libraryId={session.libraryId}
          rounds={snapshot.rounds}
          submissions={snapshot.submissions}
          onOpenRound={(round) => {
            setRoundType(round.type);
            setTargetMonth(round.targetMonth);
            setAdminView("collection");
          }}
        />
      ) : session.role === "submitter" && adminView === "help" ? (
        <HelpPanel />
      ) : session.role === "submitter" && submitterSubmission ? (
        <SubmitterDashboard
          key={`${selectedRound.id}-${submitterSubmission.id}-${submitterSubmission.savedAt}-${submitterSubmission.status}`}
          submission={submitterSubmission}
          round={selectedRound}
          onSave={saveSubmission}
          onSubmit={submit}
        />
      ) : session.role === "admin" && adminView === "settings" ? (
        <AdminSettingsPanel
          busy={busy}
          snapshot={snapshot}
          onRefresh={() => void loadSnapshot()}
        />
      ) : session.role === "admin" ? (
        <AdminDashboard
          key={selectedRound.id}
          adminView={adminView}
          auditLog={snapshot.auditLog}
          busy={busy}
          generatedFiles={snapshot.generatedFiles}
          rounds={snapshot.rounds}
          submissions={activeSubmissions}
          round={selectedRound}
          onTargetMonthChange={setTargetMonth}
          onRoundTypeChange={setRoundType}
          onCompleteReview={completeReview}
          onCreateCollectionMonth={createCollectionMonth}
          onDeleteProgram={deleteProgram}
          onDownloadGeneratedFile={downloadGeneratedFile}
          onGenerateHwpx={generateHwpx}
          onAdminViewChange={setAdminView}
          onPreviewHwpx={previewHwpx}
          onSave={saveSubmission}
          onSetCollectionStatus={setCollectionStatus}
          onRequestRevision={requestRevision}
        />
      ) : (
        <div className="loading-screen">
          이 계정에 연결된 수합 자료가 없습니다.
        </div>
      )}
    </AppShell>
  );
}

function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="loading-screen" aria-busy="true">
      <div className="loading-card" role="status">
        <span className="loading-spinner" aria-hidden="true" />
        <strong>{message}</strong>
        <span>운영 데이터를 안전하게 확인하고 있습니다.</span>
      </div>
    </main>
  );
}

function StartupErrorScreen({
  busy,
  message,
  onLogout,
  onRetry,
}: {
  busy: boolean;
  message: string;
  onLogout: () => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  return (
    <main className="startup-error-screen">
      <section className="startup-error-card" aria-labelledby="startup-error-title">
        <span className="startup-error-icon" aria-hidden="true">
          <AlertTriangle size={25} />
        </span>
        <div>
          <span>운영 데이터 연결</span>
          <h1 id="startup-error-title">수합 화면을 불러오지 못했습니다.</h1>
          <p role="alert">{message}</p>
          <small>
            입력 내용은 변경되지 않았습니다. 잠시 후 다시 시도하거나
            재로그인해주세요.
          </small>
        </div>
        <div className="startup-error-actions">
          <button
            className="button button--primary"
            disabled={busy}
            onClick={() => void onRetry()}
            type="button"
          >
            <RefreshCw size={16} />
            {busy ? "다시 연결 중…" : "다시 시도"}
          </button>
          <button
            className="button button--outline"
            disabled={busy}
            onClick={() => void onLogout()}
            type="button"
          >
            <LogOut size={16} />
            로그아웃
          </button>
        </div>
      </section>
    </main>
  );
}

function messageFor(cause: unknown): string {
  if (
    cause instanceof AuthClientError ||
    cause instanceof RemoteRepositoryError ||
    cause instanceof HwpxClientError
  ) {
    return cause.message;
  }
  return "요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.";
}
