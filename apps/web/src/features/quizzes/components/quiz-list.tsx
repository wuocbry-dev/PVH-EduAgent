"use client";

import { QUIZ_RESULT_NOTE, type QuizAvailableDto } from "@pvh/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { usePortalBase } from "@/shared/lib/use-portal-base";
import { listAvailable, startAttempt } from "../api/quizzes-api";
import { Skeleton, useConfirm } from "@/shared/ui";

const scoreText = (s: number | null) => (s === null ? "đang làm" : `${s.toLocaleString("vi-VN")} điểm`);

function QuizCard({ quiz, onStart, busy }: { quiz: QuizAvailableDto; onStart: (q: QuizAvailableDto) => void; busy: boolean }) {
  const base = usePortalBase();
  const done = quiz.attempts.filter((a) => a.submittedAt);
  const best = done.reduce<number | null>((m, a) => (a.score !== null && (m === null || a.score > m) ? a.score : m), null);
  const out = quiz.attemptsLeft === 0 && !quiz.inProgressId;
  return (
    <li className="space-y-2 rounded-2xl bg-surface border border-border p-3">
      <p className="font-semibold">{quiz.title}</p>
      <p className="text-sm opacity-75">
        {quiz.subjectName} · {quiz.questionCount} câu
        {quiz.durationMinutes ? ` · ${quiz.durationMinutes} phút` : " · không giới hạn thời gian"}
        {quiz.maxAttempts ? ` · còn ${quiz.attemptsLeft}/${quiz.maxAttempts} lần` : ""}
      </p>
      {quiz.description && <p className="text-sm text-muted">{quiz.description}</p>}
      {best !== null && <p className="text-sm">Cao nhất: {best.toLocaleString("vi-VN")} điểm</p>}
      <button
        type="button"
        disabled={busy || out}
        onClick={() => onStart(quiz)}
        className="w-full rounded-xl bg-primary px-4 py-2.5 text-primary-foreground disabled:opacity-50 sm:w-auto"
      >
        {quiz.inProgressId ? "Làm tiếp" : out ? "Đã hết lượt làm" : done.length ? "Làm lại" : "Bắt đầu làm bài"}
      </button>
      {done.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">Các lần đã làm ({done.length})</summary>
          <ul className="mt-1 space-y-1">
            {done.map((a) => (
              <li key={a.id}>
                <Link href={`${base}/trac-nghiem/${a.id}`} className="underline">
                  {formatDateTime(a.submittedAt!)}
                </Link>{" "}
                – {scoreText(a.score)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

export function useStartQuiz() {
  const ask = useConfirm();
  const router = useRouter();
  const base = usePortalBase();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function start(quiz: QuizAvailableDto) {
    if (!quiz.inProgressId && quiz.durationMinutes && !(await ask(`Bài có ${quiz.durationMinutes} phút. Đồng hồ chạy ngay khi bắt đầu. Bắt đầu?`))) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await startAttempt(quiz.id);
      router.push(`${base}/trac-nghiem/${attempt.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  return { start, busy, error };
}

// Danh sách bài ôn tập em được làm (đúng khối/lớp), kèm lịch sử các lần làm.
export function QuizList() {
  const { data, error } = useData(listAvailable, undefined);
  const { start, busy, error: startError } = useStartQuiz();
  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!data) return <Skeleton />;
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-warning/40 bg-warning-soft p-3 text-sm text-warning">
        {QUIZ_RESULT_NOTE}
      </p>
      {startError && <p className="text-sm text-danger">{startError}</p>}
      {data.length === 0 ? (
        <p className="text-sm text-muted">Hiện chưa có bài ôn tập nào cho lớp em.</p>
      ) : (
        <ul className="space-y-3">
          {data.map((q) => (
            <QuizCard key={q.id} quiz={q} onStart={start} busy={busy} />
          ))}
        </ul>
      )}
    </div>
  );
}

// Trong trang tài liệu thư viện: bài ôn tập gắn với tài liệu (chỉ hiện với học sinh; người khác API trả lỗi thì ẩn).
export function LibraryQuizzes({ libraryItemId }: { libraryItemId: string }) {
  const { data } = useData(listAvailable, libraryItemId);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!data || data.length === 0) return null;
  async function start(quiz: QuizAvailableDto) {
    setBusy(true);
    try {
      const attempt = await startAttempt(quiz.id);
      router.push(`/hoc-sinh/trac-nghiem/${attempt.id}`);
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Ôn tập với tài liệu này</h2>
      <p className="text-xs text-muted">{QUIZ_RESULT_NOTE}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="space-y-2">
        {data.map((q) => (
          <li key={q.id} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              {q.title} ({q.questionCount} câu{q.durationMinutes ? `, ${q.durationMinutes} phút` : ""})
            </span>
            <button type="button" disabled={busy || (q.attemptsLeft === 0 && !q.inProgressId)} onClick={() => start(q)} className="rounded-xl bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50">
              {q.inProgressId ? "Làm tiếp" : "Làm bài"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
