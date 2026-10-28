"use client";

import {
  QUIZ_RESULT_NOTE,
  QUIZ_STATUS_NAMES,
  type QuizAudience,
  type QuizEditDto,
  type QuizFormOptionsDto,
  type QuizStatus,
} from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createQuiz, deleteQuiz, getFormOptions, getQuiz, getQuizStats, listManaged, setQuizStatus, updateQuiz, type QuizInput } from "../api/quizzes-api";
import { QuizQuestions } from "./quiz-questions";
import { buttonStyles, EmptyState, FormActions, Skeleton, useConfirm } from "@/shared/ui";

const small = "rounded-xl border border-border-strong px-3 py-1 text-sm disabled:opacity-50";
const STATUS_STYLE: Record<QuizStatus, string> = {
  DRAFT: "border border-border bg-surface-muted text-muted",
  PUBLISHED: "bg-success-soft text-success",
  ARCHIVED: "border border-border bg-surface-muted text-muted",
};

// Trắc nghiệm ôn tập – người soạn: giáo viên (môn mình dạy, khối/lớp mình dạy), thủ thư/BGH (mọi quiz).
export function QuizManager() {
  const options = useData(getFormOptions, undefined);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const list = useData(listManaged, scope);
  const [open, setOpen] = useState<string | "new" | null>(null);

  if (options.error) return <p className={errorClass}>{options.error}</p>;
  if (!options.data) return <Skeleton />;
  if (open) {
    return (
      <QuizEditor
        id={open === "new" ? null : open}
        options={options.data}
        onClose={() => {
          setOpen(null);
          list.reload();
        }}
        onCreated={(id) => setOpen(id)}
      />
    );
  }
  const noSubject = !options.data.canManage && options.data.subjects.length === 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{QUIZ_RESULT_NOTE} Chấm tự động ở máy chủ; học sinh không thấy đáp án trước khi nộp.</p>
      {noSubject ? (
        <p className="text-sm text-warning">Bạn chưa được phân công dạy môn nào trong năm học hiện hành nên chưa soạn được trắc nghiệm.</p>
      ) : (
        <button type="button" onClick={() => setOpen("new")} className="rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground">
          + Bộ câu hỏi mới
        </button>
      )}
      {options.data.canManage && (
        <div className="flex gap-2 text-sm">
          {(["mine", "all"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setScope(s)} className={`rounded-full border px-3 py-1 ${scope === s ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"}`}>
              {s === "mine" ? "Của tôi" : "Tất cả"}
            </button>
          ))}
        </div>
      )}
      {list.error && <p className={errorClass}>{list.error}</p>}
      {!list.data ? (
        <Skeleton />
      ) : list.data.length === 0 ? (
        <EmptyState>Chưa có bộ câu hỏi nào.</EmptyState>
      ) : (
        <ul className="divide-y divide-border rounded-2xl bg-surface border border-border">
          {list.data.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-2 p-3">
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${STATUS_STYLE[q.status]}`}>{QUIZ_STATUS_NAMES[q.status]}</span>
              <span className="min-w-0 flex-1 break-words">
                <span className="font-medium">{q.title}</span>{" "}
                <span className="text-xs text-muted">
                  {q.subjectName} · khối {q.gradeLevel} · {q.audienceLabel} · {q.questionCount} câu · {q.createdByName} · {formatDateTime(q.updatedAt)}
                </span>
              </span>
              <button type="button" className={small} onClick={() => setOpen(q.id)}>
                Mở
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const loadQuiz = (key: string | null) => (key ? getQuiz(key) : Promise.resolve(null));

function QuizEditor({ id, options, onClose, onCreated }: { id: string | null; options: QuizFormOptionsDto; onClose: () => void; onCreated: (id: string) => void }) {
  const ask = useConfirm();
  const loaded = useData(loadQuiz, id);
  const [quiz, setQuiz] = useState<QuizEditDto | null>(null);
  const [tab, setTab] = useState<"cau-hoi" | "cai-dat" | "thong-ke">("cai-dat");
  const [error, setError] = useState<string | null>(null);
  const current = quiz ?? loaded.data;
  if (id && !current) return loaded.error ? <p className={errorClass}>{loaded.error}</p> : <Skeleton />;

  async function status(next: QuizStatus) {
    if (!current) return;
    setError(null);
    try {
      setQuiz(await setQuizStatus(current.id, next));
    } catch (err) {
      setError(errorText(err));
    }
  }
  async function remove() {
    if (!current || !(await ask(`Xoá "${current.title}"?`))) return;
    try {
      await deleteQuiz(current.id);
      onClose();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-4">
      <button type="button" className={small} onClick={onClose}>
        ← Danh sách
      </button>
      {current && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{current.title}</h2>
            <span className={`rounded-full px-1.5 py-0.5 text-xs ${STATUS_STYLE[current.status]}`}>{QUIZ_STATUS_NAMES[current.status]}</span>
            <span className="text-sm text-muted">
              {current.questions.length} câu · {current.attemptCount} lượt làm
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {current.status !== "PUBLISHED" && (
              <button type="button" className="rounded-xl bg-primary px-3 py-1 text-sm text-primary-foreground" onClick={() => status("PUBLISHED")}>
                Công bố cho học sinh
              </button>
            )}
            {current.status === "PUBLISHED" && (
              <button type="button" className={small} onClick={() => status("ARCHIVED")}>
                Ẩn
              </button>
            )}
            {current.status === "PUBLISHED" && current.attemptCount === 0 && (
              <button type="button" className={small} onClick={() => status("DRAFT")}>
                Về nháp
              </button>
            )}
            {current.attemptCount === 0 && (
              <button type="button" className={`${small} text-danger`} onClick={remove}>
                Xoá
              </button>
            )}
          </div>
          <div role="tablist" className="flex flex-wrap gap-2">
            {(
              [
                ["cai-dat", "Thông tin"],
                ["cau-hoi", `Câu hỏi (${current.questions.length})`],
                ["thong-ke", "Thống kê"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-full border px-3 py-1 text-sm ${tab === key ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"}`}>
                {label}
              </button>
            ))}
          </div>
        </>
      )}
      {error && <p className={errorClass}>{error}</p>}
      {(!current || tab === "cai-dat") && (
        <QuizSettings
          key={current?.id ?? "new"}
          quiz={current}
          options={options}
          onSaved={(q) => {
            setQuiz(q);
            if (!current) onCreated(q.id);
            else setTab("cau-hoi");
          }}
        />
      )}
      {current && tab === "cau-hoi" && <QuizQuestions key={`${current.id}-${current.updatedAt}`} quiz={current} onSaved={setQuiz} />}
      {current && tab === "thong-ke" && <QuizStats id={current.id} />}
    </div>
  );
}

function QuizSettings({ quiz, options, onSaved }: { quiz: QuizEditDto | null; options: QuizFormOptionsDto; onSaved: (q: QuizEditDto) => void }) {
  const [subjectId, setSubjectId] = useState(quiz?.subjectId ?? options.subjects[0]?.id ?? "");
  const subject = options.subjects.find((s) => s.id === subjectId);
  const [gradeLevel, setGradeLevel] = useState(quiz?.gradeLevel ?? subject?.grades[0] ?? 10);
  const [audience, setAudience] = useState<QuizAudience>(quiz?.audience ?? "GRADE");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = "block space-y-1 text-sm";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const num = (name: string) => (String(data.get(name) ?? "").trim() ? Number(data.get(name)) : null);
    const input: QuizInput = {
      title: String(data.get("title")).trim(),
      description: String(data.get("description") ?? "").trim() || null,
      subjectId,
      gradeLevel,
      audience,
      gradeLevels: audience === "GRADE" ? data.getAll("gradeLevels").map(Number) : [],
      classIds: audience === "CLASS" ? data.getAll("classIds").map(String) : [],
      durationMinutes: num("durationMinutes"),
      maxAttempts: num("maxAttempts"),
      shuffleQuestions: data.get("shuffleQuestions") === "on",
      shuffleOptions: data.get("shuffleOptions") === "on",
      showAnswers: data.get("showAnswers") === "on",
      libraryItemId: String(data.get("libraryItemId") ?? "") || null,
    };
    setBusy(true);
    setError(null);
    try {
      onSaved(quiz ? await updateQuiz(quiz.id, input) : await createQuiz(input));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  const classes = subject?.classes.filter((c) => c.gradeLevel === gradeLevel) ?? [];
  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl bg-surface border border-border p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}>
          <span>Tên bộ câu hỏi *</span>
          <input name="title" required maxLength={200} defaultValue={quiz?.title} className={inputClass} />
        </label>
        <label className={label}>
          <span>Môn *</span>
          <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} disabled={!!quiz?.attemptCount} className={inputClass}>
            {options.subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          <span>Khối *</span>
          <select value={gradeLevel} onChange={(e) => setGradeLevel(Number(e.target.value))} disabled={!!quiz?.attemptCount} className={inputClass}>
            {(subject?.grades ?? []).map((g) => (
              <option key={g} value={g}>
                Khối {g}
              </option>
            ))}
          </select>
        </label>
        <label className={`${label} sm:col-span-2`}>
          <span>Mô tả</span>
          <textarea name="description" rows={2} maxLength={2000} defaultValue={quiz?.description ?? ""} className={inputClass} />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Ai được làm</legend>
        <div className="flex flex-wrap gap-3 text-sm">
          {(options.canManage ? (["ALL", "GRADE", "CLASS"] as const) : (["GRADE", "CLASS"] as const)).map((a) => (
            <label key={a} className="flex items-center gap-1">
              <input type="radio" checked={audience === a} onChange={() => setAudience(a)} />
              {a === "ALL" ? "Toàn trường" : a === "GRADE" ? "Cả khối" : "Một số lớp"}
            </label>
          ))}
        </div>
        {audience === "GRADE" && (
          <div className="flex flex-wrap gap-3 text-sm">
            {(subject?.grades ?? []).map((g) => (
              <label key={g} className="flex items-center gap-1">
                <input type="checkbox" name="gradeLevels" value={g} defaultChecked={quiz ? quiz.gradeLevels.includes(g) : g === gradeLevel} />
                Khối {g}
              </label>
            ))}
          </div>
        )}
        {audience === "CLASS" && (
          <div className="flex max-h-40 flex-wrap gap-3 overflow-auto text-sm">
            {classes.length === 0 && <span className="text-muted">Không có lớp nào của khối {gradeLevel}.</span>}
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-1">
                <input type="checkbox" name="classIds" value={c.id} defaultChecked={quiz?.classIds.includes(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        )}
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>
          <span>Thời gian làm (phút, để trống = không giới hạn)</span>
          <input name="durationMinutes" type="number" min={1} max={300} defaultValue={quiz?.durationMinutes ?? ""} className={inputClass} />
        </label>
        <label className={label}>
          <span>Số lần làm tối đa (để trống = không giới hạn)</span>
          <input name="maxAttempts" type="number" min={1} max={100} defaultValue={quiz?.maxAttempts ?? ""} className={inputClass} />
        </label>
        <label className={`${label} sm:col-span-2`}>
          <span>Gắn với tài liệu thư viện (tuỳ chọn)</span>
          <select name="libraryItemId" defaultValue={quiz?.libraryItemId ?? ""} className={inputClass}>
            <option value="">Không gắn</option>
            {options.libraryItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-1">
          <input type="checkbox" name="shuffleQuestions" defaultChecked={quiz?.shuffleQuestions} /> Xáo trộn câu hỏi
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="shuffleOptions" defaultChecked={quiz?.shuffleOptions} /> Xáo trộn đáp án
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" name="showAnswers" defaultChecked={quiz?.showAnswers ?? true} /> Cho xem đáp án và giải thích sau khi nộp
        </label>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      <FormActions>
        <button type="submit" disabled={busy || !subjectId} className={buttonStyles()}>
          {busy ? "Đang lưu…" : quiz ? "Lưu thông tin" : "Tạo và soạn câu hỏi"}
        </button>
      </FormActions>
    </form>
  );
}

function QuizStats({ id }: { id: string }) {
  const { data, error } = useData(getQuizStats, id);
  if (error) return <p className={errorClass}>{error}</p>;
  if (!data) return <Skeleton />;
  const labels = ["0–2", "2–4", "4–6", "6–8", "8–10"];
  const max = Math.max(1, ...data.distribution);
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-3 gap-3">
        {(
          [
            ["Lượt nộp", data.attempts],
            ["Học sinh", data.students],
            ["Điểm TB", data.average === null ? "–" : data.average.toLocaleString("vi-VN")],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-surface border border-border p-3">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-1">
        <h3 className="font-semibold">Phổ điểm</h3>
        {data.distribution.map((n, i) => (
          <div key={labels[i]} className="flex items-center gap-2 text-sm">
            <span className="w-12 shrink-0 tabular-nums">{labels[i]}</span>
            <span className="h-3 rounded-xl bg-navy" style={{ width: `${(n / max) * 70}%`, minWidth: n ? 4 : 0 }} aria-hidden />
            <span className="tabular-nums">{n}</span>
          </div>
        ))}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">Câu sai nhiều nhất</h3>
        {data.attempts === 0 ? (
          <EmptyState>Chưa có học sinh nộp bài.</EmptyState>
        ) : (
          <ol className="space-y-1 text-sm">
            {data.questions.map((q) => (
              <li key={q.id} className="flex gap-2">
                <span className="w-16 shrink-0 font-medium tabular-nums">Câu {q.position}</span>
                <span className="min-w-0 flex-1 truncate">{q.content}</span>
                <span className="shrink-0 tabular-nums">
                  sai {q.wrong}/{data.attempts} ({q.wrongRate.toLocaleString("vi-VN")}%)
                </span>
              </li>
            ))}
          </ol>
        )}
        <p className="text-xs text-muted">Câu bỏ trống tính là sai. Chỉ tính các lần đã nộp.</p>
      </section>
    </div>
  );
}
