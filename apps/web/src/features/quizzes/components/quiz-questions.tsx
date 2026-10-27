"use client";

import {
  QUIZ_MAX_OPTIONS,
  QUIZ_MIN_OPTIONS,
  QUIZ_OPTION_LETTERS,
  type QuizEditDto,
  type QuizImportPreviewDto,
  type QuizQuestionInput,
} from "@pvh/shared";
import { useState } from "react";
import { mediaSrc } from "@/shared/lib/media-url";
import { errorText } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { confirmImport, downloadTemplate, previewImport, saveQuestions, uploadQuestionImage } from "../api/quizzes-api";

const small = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";

interface Draft {
  key: number;
  text: string;
  images: string[];
  explanation: string;
  options: { content: string; correct: boolean }[];
}

let seq = 0;
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Nội dung câu hỏi soạn dạng văn bản (đoạn cách nhau bằng dòng trống) + ảnh; server làm sạch lại HTML.
function toHtml(d: Draft): string {
  const text = d.text
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((p) => `<p>${escape(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return text + d.images.map((src) => `<img src="${escape(src)}" alt="">`).join("");
}

function fromHtml(html: string): Pick<Draft, "text" | "images"> {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const images = [...doc.querySelectorAll("img")].map((img) => img.getAttribute("src") ?? "").filter(Boolean);
  doc.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
  const blocks = [...doc.body.querySelectorAll("p")].map((p) => p.textContent ?? "");
  return { text: (blocks.length ? blocks : [doc.body.textContent ?? ""]).join("\n\n").trim(), images };
}

const toDraft = (q: QuizEditDto["questions"][number]): Draft => ({
  key: ++seq,
  ...fromHtml(q.content),
  explanation: q.explanation ?? "",
  options: q.options.map((o) => ({ content: o.content, correct: o.correct })),
});
const empty = (): Draft => ({ key: ++seq, text: "", images: [], explanation: "", options: [{ content: "", correct: true }, { content: "", correct: false }, { content: "", correct: false }, { content: "", correct: false }] });

// Soạn câu hỏi: thêm/xoá/đổi thứ tự câu, đánh dấu một hoặc nhiều đáp án đúng, chèn ảnh, xem trước như học sinh thấy.
// Khoá khi đã có học sinh làm bài.
export function QuizQuestions({ quiz, onSaved }: { quiz: QuizEditDto; onSaved: (q: QuizEditDto) => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(() => (quiz.questions.length ? quiz.questions.map(toDraft) : [empty()]));
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = quiz.attemptCount > 0;

  const update = (key: number, change: (d: Draft) => Draft) => setDrafts((all) => all.map((d) => (d.key === key ? change(d) : d)));
  const move = (i: number, by: number) =>
    setDrafts((all) => {
      const next = [...all];
      const [d] = next.splice(i, 1);
      next.splice(i + by, 0, d);
      return next;
    });

  async function save() {
    const questions: QuizQuestionInput[] = drafts.map((d) => ({
      content: toHtml(d),
      explanation: d.explanation.trim() || null,
      options: d.options.map((o) => ({ content: o.content.trim(), correct: o.correct })),
    }));
    const bad = questions.findIndex((q) => !q.content || q.options.some((o) => !o.content) || !q.options.some((o) => o.correct));
    if (bad >= 0) return setError(`Câu ${bad + 1}: cần nội dung, đủ đáp án và ít nhất một đáp án đúng`);
    setBusy(true);
    setError(null);
    try {
      const saved = await saveQuestions(quiz.id, questions);
      setMessage(`Đã lưu ${saved.questions.length} câu hỏi.`);
      onSaved(saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  async function addImage(key: number, file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const media = await uploadQuestionImage(file);
      update(key, (d) => ({ ...d, images: [...d.images, mediaSrc(media.url)] }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  if (locked) {
    return (
      <div className="space-y-3">
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
          Đã có {quiz.attemptCount} lượt làm bài nên câu hỏi không sửa được nữa (để kết quả và thống kê không bị sai). Muốn đổi câu hỏi, hãy
          ẩn bộ này và soạn bộ mới.
        </p>
        <QuestionPreview drafts={quiz.questions.map(toDraft)} showCorrect />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={small} onClick={() => setPreview((p) => !p)}>
          {preview ? "← Quay lại soạn" : "Xem trước như học sinh"}
        </button>
        <ImportPanel quizId={quiz.id} onDone={(q) => { setDrafts(q.questions.map(toDraft)); setMessage(`Đã nhập, bộ câu hỏi có ${q.questions.length} câu.`); onSaved(q); }} />
      </div>
      {preview ? (
        <QuestionPreview drafts={drafts} />
      ) : (
        <ol className="space-y-4">
          {drafts.map((d, i) => (
            <li key={d.key} className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">Câu {i + 1}</span>
                <span className="ml-auto flex gap-1">
                  <button type="button" className={small} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Lên">↑</button>
                  <button type="button" className={small} disabled={i === drafts.length - 1} onClick={() => move(i, 1)} aria-label="Xuống">↓</button>
                  <button type="button" className={`${small} text-red-700`} onClick={() => setDrafts((all) => all.filter((x) => x.key !== d.key))}>
                    Xoá câu
                  </button>
                </span>
              </div>
              <textarea
                value={d.text}
                onChange={(e) => update(d.key, (x) => ({ ...x, text: e.target.value }))}
                rows={3}
                placeholder="Nội dung câu hỏi"
                aria-label={`Nội dung câu ${i + 1}`}
                className={inputClass}
              />
              <div className="flex flex-wrap items-center gap-2">
                {d.images.map((src) => (
                  <span key={src} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" className="h-16 rounded border border-black/10" />
                    <button type="button" aria-label="Bỏ ảnh" className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs text-white" onClick={() => update(d.key, (x) => ({ ...x, images: x.images.filter((s) => s !== src) }))}>
                      ×
                    </button>
                  </span>
                ))}
                <label className={`${small} cursor-pointer`}>
                  + Ảnh
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="sr-only" onChange={(e) => addImage(d.key, e.target.files?.[0])} />
                </label>
              </div>
              <fieldset className="space-y-1">
                <legend className="text-sm opacity-80">Đáp án (đánh dấu ô bên trái cho đáp án đúng; nhiều đáp án đúng thì phải chọn đúng hết mới được điểm)</legend>
                {d.options.map((o, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={o.correct}
                      aria-label={`Đáp án ${QUIZ_OPTION_LETTERS[j]} đúng`}
                      onChange={() => update(d.key, (x) => ({ ...x, options: x.options.map((y, k) => (k === j ? { ...y, correct: !y.correct } : y)) }))}
                    />
                    <b className="w-4">{QUIZ_OPTION_LETTERS[j]}</b>
                    <input
                      value={o.content}
                      maxLength={1000}
                      onChange={(e) => update(d.key, (x) => ({ ...x, options: x.options.map((y, k) => (k === j ? { ...y, content: e.target.value } : y)) }))}
                      className={inputClass}
                      aria-label={`Đáp án ${QUIZ_OPTION_LETTERS[j]}`}
                    />
                    {d.options.length > QUIZ_MIN_OPTIONS && (
                      <button type="button" aria-label="Bỏ đáp án" className={small} onClick={() => update(d.key, (x) => ({ ...x, options: x.options.filter((_, k) => k !== j) }))}>
                        −
                      </button>
                    )}
                  </div>
                ))}
                {d.options.length < QUIZ_MAX_OPTIONS && (
                  <button type="button" className={small} onClick={() => update(d.key, (x) => ({ ...x, options: [...x.options, { content: "", correct: false }] }))}>
                    + Đáp án
                  </button>
                )}
              </fieldset>
              <input
                value={d.explanation}
                onChange={(e) => update(d.key, (x) => ({ ...x, explanation: e.target.value }))}
                placeholder="Giải thích (hiện sau khi nộp, nếu cho xem đáp án)"
                className={inputClass}
              />
            </li>
          ))}
        </ol>
      )}
      {error && <p className={errorClass}>{error}</p>}
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={small} onClick={() => setDrafts((all) => [...all, empty()])}>
          + Thêm câu
        </button>
        <button type="button" onClick={save} disabled={busy} className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
          {busy ? "Đang lưu…" : `Lưu ${drafts.length} câu hỏi`}
        </button>
      </div>
    </div>
  );
}

// Xem trước như học sinh thấy (không lộ đáp án), hoặc kèm đáp án đúng khi chỉ xem.
function QuestionPreview({ drafts, showCorrect = false }: { drafts: Draft[]; showCorrect?: boolean }) {
  return (
    <ol className="space-y-4">
      {drafts.map((d, i) => (
        <li key={d.key} className="space-y-2">
          <div className="flex gap-2">
            <span className="font-semibold">Câu {i + 1}.</span>
            <div className="rich-content min-w-0 flex-1" dangerouslySetInnerHTML={{ __html: toHtml(d) }} />
          </div>
          {d.options.filter((o) => o.correct).length > 1 && <p className="text-xs opacity-70">Chọn tất cả đáp án đúng.</p>}
          <ul className="space-y-1">
            {d.options.map((o, j) => (
              <li key={j} className={`rounded border px-3 py-2 text-sm ${showCorrect && o.correct ? "border-green-600 bg-green-50 dark:bg-green-950" : "border-black/15 dark:border-white/20"}`}>
                <b>{QUIZ_OPTION_LETTERS[j]}.</b> {o.content}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// Nhập câu hỏi từ Excel theo file mẫu: xem trước từng dòng (lỗi kèm lý do) → xác nhận thêm câu hợp lệ vào cuối bộ.
function ImportPanel({ quizId, onDone }: { quizId: string; onDone: (q: QuizEditDto) => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<QuizImportPreviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await previewImport(quizId, file));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function confirmIt() {
    if (!result) return;
    setBusy(true);
    try {
      onDone(await confirmImport(result.previewId));
      setResult(null);
      setOpen(false);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={small} onClick={() => setOpen(true)}>
        Nhập từ Excel
      </button>
    );
  }
  return (
    <div className="w-full space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm">
        Cột: Câu hỏi, A, B, C, D (E, F tuỳ chọn), Đáp án đúng (vd. <code>B</code> hoặc <code>A, C</code>), Giải thích.{" "}
        <button type="button" className="underline" onClick={() => downloadTemplate().catch((e) => setError(errorText(e)))}>
          Tải file mẫu
        </button>
        . Lưu ý: nhập Excel sẽ thêm câu vào cuối bộ, hãy lưu phần đang soạn trước.
      </p>
      <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="block w-full text-sm" />
      {error && <p className={errorClass}>{error}</p>}
      {result && (
        <div className="space-y-2">
          <p className="text-sm">
            {result.okCount} câu hợp lệ, {result.errorCount} dòng lỗi (sẽ bỏ qua).
          </p>
          <div className="max-h-64 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="p-1">Dòng</th>
                  <th className="p-1">Câu hỏi</th>
                  <th className="p-1">Đúng</th>
                  <th className="p-1">Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.row} className={r.status === "ERROR" ? "bg-red-50 dark:bg-red-950" : ""}>
                    <td className="p-1">{r.row}</td>
                    <td className="max-w-48 truncate p-1">{r.question}</td>
                    <td className="p-1">{r.correct}</td>
                    <td className="p-1">{r.message ?? "Hợp lệ"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={busy || result.okCount === 0} onClick={confirmIt} className="rounded bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">
            Thêm {result.okCount} câu
          </button>
        </div>
      )}
      <button type="button" className={small} onClick={() => { setOpen(false); setResult(null); }}>
        Đóng
      </button>
    </div>
  );
}
