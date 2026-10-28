"use client";

import { QUIZ_OPTION_LETTERS, QUIZ_RESULT_NOTE, type QuizAttemptDto } from "@pvh/shared";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/shared/lib/api-client";
import { errorText } from "@/shared/lib/use-data";
import { usePortalBase } from "@/shared/lib/use-portal-base";
import { getAttempt, saveAnswer, submitAttempt } from "../api/quizzes-api";
import { Skeleton, useConfirm } from "@/shared/ui";

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// Làm bài: đề không có đáp án đúng (chấm ở server). Mỗi lần chọn được lưu ngay lên server; đồng hồ đếm theo giờ server, hết
// giờ thì server tự nộp phần đã lưu. Sau khi nộp hiện điểm, câu đúng/sai và (nếu bộ câu hỏi cho phép) đáp án, giải thích.
export function QuizRunner({ attemptId }: { attemptId: string }) {
  const ask = useConfirm();
  const base = usePortalBase();
  const [attempt, setAttempt] = useState<QuizAttemptDto | null>(null);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Độ lệch giữa giờ server và giờ máy (đồng hồ đếm ngược theo giờ server).
  const [offset, setOffset] = useState(0);

  const apply = useCallback((a: QuizAttemptDto) => {
    setOffset(new Date(a.serverNow).getTime() - Date.now());
    setAttempt(a);
    setSelected(Object.fromEntries((a.questions ?? []).map((q) => [q.id, q.selected])));
  }, []);
  const load = useCallback(
    () =>
      getAttempt(attemptId)
        .then(apply)
        .catch((err: unknown) => setError(errorText(err))),
    [attemptId, apply],
  );

  useEffect(() => {
    let current = true;
    getAttempt(attemptId)
      .then((a) => current && apply(a))
      .catch((err: unknown) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [attemptId, apply]);

  const running = !!attempt && !attempt.submittedAt;
  const remaining = attempt?.deadline ? new Date(attempt.deadline).getTime() - (now + offset) : null;

  useEffect(() => {
    if (!running || remaining === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, remaining === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hết giờ: tự nộp các câu đã chọn (một lần). Server vẫn là nơi quyết định: quá hạn + thời gian bù mạng thì chỉ chấm
  // phần đã lưu trước đó (trả 409) và trang tải lại kết quả.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (!running || remaining === null || remaining > 0 || autoSubmitted.current || !attempt?.questions) return;
    autoSubmitted.current = true;
    submitAttempt(attemptId, attempt.questions.map((q) => ({ questionId: q.id, optionIds: selected[q.id] ?? [] })))
      .then(setAttempt)
      .catch(() => load());
  }, [running, remaining, attempt, attemptId, selected, load]);

  async function choose(questionId: string, optionId: string, multiple: boolean) {
    const current = selected[questionId] ?? [];
    const next = multiple ? (current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId]) : [optionId];
    setSelected((s) => ({ ...s, [questionId]: next }));
    try {
      await saveAnswer(attemptId, questionId, next);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) void load();
      else setError(`Chưa lưu được câu trả lời: ${errorText(err)}`);
    }
  }

  async function submit() {
    if (!attempt?.questions) return;
    const blank = attempt.questions.filter((q) => !(selected[q.id]?.length)).length;
    if (!(await ask(blank ? `Còn ${blank} câu chưa trả lời. Nộp bài?` : "Nộp bài?"))) return;
    setBusy(true);
    try {
      const result = await submitAttempt(
        attemptId,
        attempt.questions.map((q) => ({ questionId: q.id, optionIds: selected[q.id] ?? [] })),
      );
      setAttempt(result);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) await load();
      else setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (error && !attempt) return <p className="text-sm text-danger">{error}</p>;
  if (!attempt) return <Skeleton label="Đang tải bài…" />;

  if (!running) return <QuizResult attempt={attempt} back={`${base}/trac-nghiem`} />;

  const answered = attempt.questions!.filter((q) => selected[q.id]?.length).length;
  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 -mx-4 flex items-center justify-between gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur md:top-0 md:-mx-8 md:px-8 print:hidden">
        <span className="text-sm">
          Đã làm {answered}/{attempt.questions!.length} câu
        </span>
        {remaining !== null && (
          <span role="timer" aria-live="off" className={`font-mono text-lg font-bold tabular-nums ${remaining < 60_000 ? "text-danger" : ""}`}>
            ⏱ {clock(remaining)}
          </span>
        )}
      </div>
      <h1 className="text-xl font-bold">{attempt.quizTitle}</h1>
      {error && <p className="text-sm text-danger">{error}</p>}
      <ol className="space-y-5">
        {attempt.questions!.map((q, i) => (
          <li key={q.id} className="space-y-2">
            <div className="flex gap-2">
              <span className="font-semibold">Câu {i + 1}.</span>
              <div className="rich-content min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: q.content }} />
            </div>
            {q.multiple && <p className="text-xs text-muted">Chọn tất cả đáp án đúng (phải đúng hết mới được điểm).</p>}
            <fieldset className="space-y-2">
              <legend className="sr-only">Đáp án câu {i + 1}</legend>
              {q.options.map((o, j) => {
                const checked = selected[q.id]?.includes(o.id) ?? false;
                return (
                  <label
                    key={o.id}
                    className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 ${checked ? "border-navy bg-primary-soft" : "border-border"}`}
                  >
                    <input
                      type={q.multiple ? "checkbox" : "radio"}
                      name={`q-${q.id}`}
                      checked={checked}
                      onChange={() => choose(q.id, o.id, q.multiple)}
                      className="mt-1"
                    />
                    <span className="min-w-0 break-words">
                      <b>{QUIZ_OPTION_LETTERS[j]}.</b> {o.content}
                    </span>
                  </label>
                );
              })}
            </fieldset>
          </li>
        ))}
      </ol>
      <button type="button" onClick={submit} disabled={busy} className="w-full rounded-xl bg-primary px-4 py-3 text-primary-foreground disabled:opacity-50 sm:w-auto">
        {busy ? "Đang nộp…" : "Nộp bài"}
      </button>
      <p className="text-xs text-muted">{QUIZ_RESULT_NOTE}</p>
    </div>
  );
}

function QuizResult({ attempt, back }: { attempt: QuizAttemptDto; back: string }) {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{attempt.quizTitle}</h1>
      <div className="rounded-2xl bg-surface border border-border p-4 text-center">
        <p className="text-4xl font-bold tabular-nums">{attempt.score!.toLocaleString("vi-VN")}</p>
        <p className="text-sm text-muted">
          Đúng {attempt.correctCount}/{attempt.totalCount} câu{attempt.autoSubmitted ? " · bài tự nộp khi hết giờ" : ""}
        </p>
        <p className="mt-2 text-sm font-medium text-warning">{QUIZ_RESULT_NOTE}</p>
      </div>
      {!attempt.showAnswers && <p className="text-sm text-muted">Thầy cô không cho xem đáp án của bài này.</p>}
      <ol className="space-y-4">
        {attempt.results!.map((q, i) => (
          <li key={q.id} className={`space-y-2 rounded-2xl border p-3 ${q.isCorrect ? "border-success/40" : "border-danger/40"}`}>
            <div className="flex gap-2">
              <span className={`font-semibold ${q.isCorrect ? "text-success " : "text-danger"}`}>
                {q.isCorrect ? "✓" : "✗"} Câu {i + 1}.
              </span>
              <div className="rich-content min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: q.content }} />
            </div>
            <ul className="space-y-1 text-sm">
              {q.options.map((o, j) => {
                const mine = q.selected.includes(o.id);
                return (
                  <li
                    key={o.id}
                    className={`rounded-xl px-2 py-1 ${o.correct ? "bg-success-soft text-success " : mine ? "bg-danger-soft text-danger " : ""}`}
                  >
                    <b>{QUIZ_OPTION_LETTERS[j]}.</b> {o.content}
                    {mine && " ← em chọn"}
                    {o.correct && " (đáp án đúng)"}
                  </li>
                );
              })}
            </ul>
            {q.explanation && <p className="text-sm text-muted">Giải thích: {q.explanation}</p>}
          </li>
        ))}
      </ol>
      <Link href={back} className="inline-block rounded-xl border border-border-strong px-4 py-2 text-sm">
        ← Danh sách bài ôn tập
      </Link>
    </div>
  );
}
