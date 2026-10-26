"use client";

import {
  ASSESSMENT_CLASS_STATUS_NAMES,
  formatScore,
  parseScore,
  SCORE_NOTE_MAX,
  type ScoreEntryInput,
  type ScoreRowDto,
  type ScoreSheetDto,
} from "@pvh/shared";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { publishScores, saveScores, setExemption } from "../api/scores-api";
import { ScoreImport } from "./score-import";
import { useUnsavedWarning } from "./use-unsaved-warning";

const AUTOSAVE_MS = 2000;
const cell = "rounded border border-black/20 bg-transparent px-2 py-1 dark:border-white/20";
const smallButton = "rounded border border-black/20 px-3 py-1 text-sm disabled:opacity-50 dark:border-white/20";

interface Draft {
  value: string;
  absent: boolean;
  note: string;
}

const baseOf = (r: ScoreRowDto): Draft => ({ value: formatScore(r.value), absent: r.status === "ABSENT", note: r.note ?? "" });
// So sánh theo giá trị đã chuẩn hoá ("8,5" = "8.50").
const normValue = (v: string) => {
  const p = parseScore(v);
  return p.ok ? String(p.value) : `!${v.trim()}`;
};
const sameDraft = (a: Draft, b: Draft) => a.absent === b.absent && a.note.trim() === b.note.trim() && normValue(a.value) === normValue(b.value);

function problemOf(d: Draft): string | null {
  if (d.absent) {
    if (d.value.trim()) return "Học sinh vắng thì để trống điểm";
    return d.note.trim() ? null : "Ghi lý do vắng (ốm, tai nạn…)";
  }
  const parsed = parseScore(d.value);
  return parsed.ok ? null : parsed.error;
}

const toEntry = (studentId: string, d: Draft): ScoreEntryInput =>
  d.absent
    ? { studentId, value: null, status: "ABSENT", note: d.note.trim() }
    : { studentId, value: d.value.trim() || null, status: "GRADED", note: d.note.trim() || null };

// Bảng điểm một lớp trong một đợt. Giáo viên được phân công: nhập trên lưới (Enter/mũi tên để di chuyển, kiểm tra 0–10 khi gõ,
// tự lưu sau 2 giây), nhập Excel, công bố. BGH: chỉ xem, đặt/bỏ miễn kiểm tra.
export function ScoreGrid({
  sheet,
  onSheet,
  onDirtyChange,
}: {
  sheet: ScoreSheetDto;
  onSheet: (s: ScoreSheetDto) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const savingRef = useRef(false);

  const rowsById = new Map(sheet.rows.map((r) => [r.studentId, r]));
  const changed = Object.entries(drafts).filter(([id, d]) => {
    const row = rowsById.get(id);
    return row && !sameDraft(d, baseOf(row));
  });
  const invalid = changed.filter(([, d]) => problemOf(d));
  const dirty = changed.length > 0;
  useUnsavedWarning(dirty);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const save = useCallback(async () => {
    if (savingRef.current) return false;
    const ready = changed.filter(([, d]) => !problemOf(d));
    if (ready.length === 0) return invalid.length === 0;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const res = await saveScores(sheet.assessment.id, sheet.classId, ready.map(([id, d]) => toEntry(id, d)));
      const sent = new Map(ready);
      // Bỏ các ô đã lưu, trừ khi người dùng đã sửa tiếp trong lúc đang lưu.
      setDrafts((prev) => Object.fromEntries(Object.entries(prev).filter(([id, d]) => sent.get(id) !== d)));
      onSheet(res.sheet);
      setSavedAt(new Date().toISOString());
      return invalid.length === 0;
    } catch (err) {
      setError(errorText(err));
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [changed, invalid.length, sheet.assessment.id, sheet.classId, onSheet]);

  // Tự lưu nháp: 2 giây sau lần gõ cuối, chỉ gửi các ô hợp lệ.
  const readyCount = changed.length - invalid.length;
  useEffect(() => {
    if (!sheet.canEdit || readyCount === 0) return;
    const t = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [drafts, readyCount, sheet.canEdit, save]);

  function edit(row: ScoreRowDto, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [row.studentId]: { ...(prev[row.studentId] ?? baseOf(row)), ...patch } }));
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>, index: number) {
    const move = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!move) return;
    e.preventDefault();
    const next = inputs.current[index + move];
    next?.focus();
    next?.select();
  }

  async function onPublish() {
    if (dirty && !(await save())) {
      setError("Hãy sửa các ô lỗi trước khi công bố");
      return;
    }
    const missing = sheet.counts.missing;
    const message =
      `Công bố điểm đợt ${sheet.assessment.code} cho lớp ${sheet.className}?` +
      (missing > 0 ? `\n\nCòn ${missing} học sinh chưa có điểm.` : "\n\nĐã đủ điểm cho cả lớp.") +
      "\nSau khi công bố, học sinh sẽ xem được điểm; vẫn sửa được trong hạn nhập điểm.";
    if (!window.confirm(message)) return;
    try {
      onSheet(await publishScores(sheet.assessment.id, sheet.classId));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function onExempt(row: ScoreRowDto) {
    const exempt = row.status !== "EXEMPT";
    const note = exempt ? window.prompt(`Lý do miễn kiểm tra cho ${row.fullName}:`)?.trim() : "Bỏ miễn";
    if (exempt && !note) return;
    try {
      onSheet(await setExemption(sheet.assessment.id, sheet.classId, row.studentId, { exempt, note }));
    } catch (err) {
      setError(errorText(err));
    }
  }

  const { counts } = sheet;
  return (
    <section className="space-y-3" aria-label={`Bảng điểm lớp ${sheet.className}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span>
          Lớp <strong>{sheet.className}</strong> · {ASSESSMENT_CLASS_STATUS_NAMES[sheet.status]}
          {sheet.publishedAt && ` lúc ${formatDateTime(sheet.publishedAt)}`}
        </span>
        <span>
          Có điểm {counts.graded}/{counts.students} · Vắng {counts.absent} · Miễn {counts.exempt} ·{" "}
          <span className={counts.missing > 0 ? "text-amber-700 dark:text-amber-400" : ""}>Còn trống {counts.missing}</span>
        </span>
        {sheet.effectiveDeadline && (
          <span className={sheet.deadlinePassed ? "text-red-600" : ""}>Hạn nhập: {formatDateTime(sheet.effectiveDeadline)}</span>
        )}
        {sheet.semesterLocked && <span className="text-red-600">Học kỳ đã khoá sổ</span>}
      </div>

      {sheet.deadlinePassed && sheet.canPublish && (
        <p className="text-sm text-red-600">
          {sheet.semesterLocked ? "Học kỳ đã khoá sổ" : "Đã quá hạn nhập điểm"}: không sửa trực tiếp được. Muốn sửa, vào mục Sổ điểm, bấm vào ô
          điểm để gửi đề nghị điều chỉnh cho Ban giám hiệu duyệt.
        </p>
      )}
      {!sheet.canEdit && !sheet.deadlinePassed && (
        <p className="text-sm opacity-70">Chế độ xem: chỉ giáo viên được phân công lớp–môn này mới nhập điểm.</p>
      )}
      {error && <p className={errorClass}>{error}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-3">STT</th>
              <th className="py-2 pr-3">Mã HS</th>
              <th className="py-2 pr-3">Họ và tên</th>
              <th className="py-2 pr-3">Điểm</th>
              <th className="py-2 pr-3">Vắng</th>
              <th className="py-2 pr-3">Ghi chú</th>
              {sheet.canExempt && <th className="py-2">Miễn</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {sheet.rows.map((row, index) => {
              const d = drafts[row.studentId] ?? baseOf(row);
              const problem = drafts[row.studentId] ? problemOf(d) : null;
              const exempt = row.status === "EXEMPT";
              const editable = sheet.canEdit && !exempt;
              const pending = changed.some(([id]) => id === row.studentId);
              return (
                <tr key={row.studentId} className={problem ? "bg-red-500/10" : pending ? "bg-yellow-500/10" : ""}>
                  <td className="py-1 pr-3">{index + 1}</td>
                  <td className="py-1 pr-3 font-mono">{row.studentCode}</td>
                  <td className="py-1 pr-3">{row.fullName}</td>
                  <td className="py-1 pr-3">
                    {exempt ? (
                      <span className="opacity-70">Miễn</span>
                    ) : editable ? (
                      <input
                        ref={(el) => {
                          inputs.current[index] = el;
                        }}
                        aria-label={`Điểm của ${row.fullName}`}
                        aria-invalid={!!problem}
                        inputMode="decimal"
                        value={d.value}
                        disabled={d.absent}
                        onChange={(e) => edit(row, { value: e.target.value })}
                        onKeyDown={(e) => onKey(e, index)}
                        onFocus={(e) => e.target.select()}
                        className={`${cell} w-20 text-right ${problem ? "border-red-600" : ""}`}
                      />
                    ) : (
                      <span>{d.absent ? "—" : d.value}</span>
                    )}
                    {problem && <p className="text-xs text-red-600">{problem}</p>}
                  </td>
                  <td className="py-1 pr-3">
                    <input
                      type="checkbox"
                      aria-label={`${row.fullName} vắng có lý do`}
                      checked={d.absent}
                      disabled={!editable}
                      onChange={(e) => edit(row, { absent: e.target.checked, value: e.target.checked ? "" : d.value })}
                    />
                  </td>
                  <td className="py-1 pr-3">
                    {editable ? (
                      <input
                        aria-label={`Ghi chú của ${row.fullName}`}
                        value={d.note}
                        maxLength={SCORE_NOTE_MAX}
                        placeholder={d.absent ? "Lý do vắng (bắt buộc)" : ""}
                        onChange={(e) => edit(row, { note: e.target.value })}
                        className={`${cell} w-56`}
                      />
                    ) : (
                      <span className="opacity-80">{row.note ?? ""}</span>
                    )}
                  </td>
                  {sheet.canExempt && (
                    <td className="py-1">
                      <button type="button" className={smallButton} onClick={() => onExempt(row)}>
                        {exempt ? "Bỏ miễn" : "Miễn"}
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
            {sheet.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 opacity-70">
                  Lớp chưa có học sinh.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(sheet.canEdit || sheet.canPublish) && (
        <div className="flex flex-wrap items-center gap-3">
          {sheet.canEdit && (
            <button type="button" className={smallButton} disabled={saving || !dirty} onClick={() => void save()}>
              {saving ? "Đang lưu…" : "Lưu ngay"}
            </button>
          )}
          {sheet.canPublish && sheet.status === "DRAFT" && (
            <button type="button" className="rounded bg-foreground px-4 py-1.5 text-sm text-background" onClick={onPublish}>
              Công bố cho lớp
            </button>
          )}
          <span className="text-sm opacity-70" aria-live="polite">
            {saving
              ? "Đang lưu nháp…"
              : invalid.length > 0
                ? `${invalid.length} ô lỗi chưa được lưu`
                : dirty
                  ? "Có thay đổi, sẽ tự lưu…"
                  : savedAt
                    ? `Đã lưu lúc ${formatDateTime(savedAt)}`
                    : ""}
          </span>
        </div>
      )}

      {sheet.canEdit && <ScoreImport sheet={sheet} onSheet={onSheet} disabled={dirty} />}
    </section>
  );
}
