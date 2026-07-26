import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";
import { activeRound } from "./data/demo";
import type { AppSnapshot, Role, Submission } from "./domain/types";
import { statusAfterSubmission } from "./domain/deadline";
import { AdminDashboard } from "./features/admin/AdminDashboard";
import { SubmitterDashboard } from "./features/submitter/SubmitterDashboard";
import { LocalCollectionRepository } from "./storage/repository";

const repository = new LocalCollectionRepository();

export default function App() {
  const [role, setRole] = useState<Role>("submitter");
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const submitterSubmission = useMemo(
    () =>
      snapshot?.submissions.find(
        (submission) => submission.libraryId === "nowon-central",
      ),
    [snapshot],
  );

  useEffect(() => {
    void repository.load().then(setSnapshot);
  }, []);

  async function saveSubmission(submission: Submission) {
    setSnapshot(await repository.saveSubmission(submission));
  }

  async function submit(submission: Submission) {
    const submittedAt = new Date().toISOString();
    await saveSubmission({
      ...submission,
      savedAt: submittedAt,
      submittedAt,
      status: statusAfterSubmission(submittedAt, activeRound.deadline),
      audit: [
        ...submission.audit,
        {
          id: crypto.randomUUID(),
          at: submittedAt,
          actor: "노원중앙도서관",
          action: "제출",
          detail: "10일 수합 자료 제출",
        },
      ],
    });
  }

  async function resetDemo() {
    setSnapshot(await repository.reset());
    setRole("submitter");
  }

  if (!snapshot || !submitterSubmission) {
    return <div className="loading-screen">수합 화면을 불러오는 중입니다.</div>;
  }

  return (
    <AppShell role={role} onRoleChange={setRole} onReset={resetDemo}>
      {role === "submitter" ? (
        <SubmitterDashboard
          key={`${submitterSubmission.id}-${submitterSubmission.savedAt}-${submitterSubmission.status}`}
          submission={submitterSubmission}
          deadline={activeRound.deadline}
          onSave={saveSubmission}
          onSubmit={submit}
        />
      ) : (
        <AdminDashboard
          submissions={snapshot.submissions}
          deadline={activeRound.deadline}
          onSave={saveSubmission}
        />
      )}
    </AppShell>
  );
}
