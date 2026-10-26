"use client";

import { ROSTER_MAX_BYTES, type ScoreImportPreviewDto, type ScoreImportRowStatus, type ScoreSheetDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorText } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { confirmScoreImport, downloadScoreTemplate, previewScoreImport } from "../api/scores-api";

const STATUS_LABEL: Record<ScoreImportRowStatus, string> = { ok: "Hợp lệ", skip: "Bỏ qua", error: "Lỗi" };
const STATUS_CLASS: Record<ScoreImportRowStatus, string> = { ok: "", skip: "bg-yellow-500/10", error: "bg-red-500/10" };
const smallButton = "rounded border border-black/20 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-white/20";

// Nhập điểm từ Excel: tải mẫu (mã + tên học sinh của lớp) → tải lên → xem trước (dòng lỗi) → xác nhận.
export function ScoreImport({ sheet, onSheet, disabled }: { sheet: ScoreSheetDto; onSheet: (s: ScoreSheetDto) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<ScoreImportPreviewDto | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const { assessment, classId, className } = sheet;

  async function onPreview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Chưa chọn file Excel (.xlsx)");
    if (file.size > ROSTER_MAX_BYTES) return setError(`File quá lớn (tối đa ${ROSTER_MAX_BYTES / 1024 / 1024} MB)`);
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      setPreview(await previewScoreImport(assessment.id, classId, file));
    } catch (err) {
      setPreview(null);
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  async function onConfirm() {
    if (!preview) return;
    setPending(true);
    setError(null);
    try {
      const res = await confirmScoreImport(preview.previewId);
      onSheet(res.sheet);
      setPreview(null);
      setMessage(`Đã nhập: ${res.created} điểm mới, ${res.updated} điểm sửa, ${res.unchanged} không đổi, bỏ qua ${res.skipped} dòng.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={smallButton} onClick={() => setOpen(true)}>
        Nhập điểm từ Excel…
      </button>
    );
  }

  return (
    <section className="space-y-3 rounded border border-black/10 p-3 dark:border-white/15" aria-label="Nhập điểm từ Excel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">Nhập điểm từ Excel</h3>
        <button type="button" className={smallButton} onClick={() => setOpen(false)}>
          Đóng
        </button>
      </div>
      <p className="text-sm opacity-70">
        Tải file mẫu đã điền sẵn mã và tên học sinh lớp {className}, điền cột Điểm (0–10, dấu phẩy hoặc chấm). Ô trống được giữ nguyên;
        vắng có lý do thì để trống điểm và ghi lý do ở cột Ghi chú.
      </p>
      {disabled && <p className="text-sm text-amber-700 dark:text-amber-400">Còn điểm chưa lưu trên lưới: hãy lưu trước khi nhập từ Excel.</p>}
      <form onSubmit={onPreview} className="flex flex-wrap items-end gap-3">
        <button
          type="button"
          className={smallButton}
          onClick={() =>
            downloadScoreTemplate(assessment.id, classId, `diem-${assessment.code}-${className}.xlsx`).catch((err) => setError(errorText(err)))
          }
        >
          Tải file mẫu
        </button>
        <label className="space-y-1 text-sm">
          <span>File điểm (.xlsx)</span>
          <input
            name="file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            required
            className={inputClass}
          />
        </label>
        <button type="submit" disabled={pending || disabled} className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50">
          {pending && !preview ? "Đang đọc file…" : "Xem trước"}
        </button>
      </form>

      {error && <p className={errorClass}>{error}</p>}
      {message && <p className="text-sm text-green-700 dark:text-green-400">{message}</p>}

      {preview && (
        <div className="space-y-3">
          <p className="flex flex-wrap gap-4 text-sm">
            <span>
              Tổng <strong>{preview.total}</strong> dòng
            </span>
            <span className="text-green-700 dark:text-green-400">
              Hợp lệ <strong>{preview.ok}</strong>
            </span>
            <span>
              Bỏ qua <strong>{preview.skipped}</strong>
            </span>
            <span className={preview.errors > 0 ? "text-red-600" : ""}>
              Lỗi <strong>{preview.errors}</strong>
            </span>
          </p>
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 border-b border-black/10 bg-background dark:border-white/15">
                <tr>
                  <th className="py-2 pr-3">Dòng</th>
                  <th className="py-2 pr-3">Kết quả</th>
                  <th className="py-2 pr-3">Mã HS</th>
                  <th className="py-2 pr-3">Họ tên</th>
                  <th className="py-2 pr-3">Điểm</th>
                  <th className="py-2">Ghi chú / lỗi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/10 dark:divide-white/15">
                {preview.rows.map((r) => (
                  <tr key={r.row} className={STATUS_CLASS[r.status]}>
                    <td className="py-1 pr-3">{r.row}</td>
                    <td className="py-1 pr-3">{STATUS_LABEL[r.status]}</td>
                    <td className="py-1 pr-3 font-mono">{r.studentCode}</td>
                    <td className="py-1 pr-3">{r.fullName}</td>
                    <td className="py-1 pr-3">{r.value ?? ""}</td>
                    <td className="py-1">{[r.message, r.note].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || preview.ok === 0}
              className="rounded bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50"
            >
              {pending ? "Đang ghi điểm…" : `Xác nhận nhập ${preview.ok} dòng`}
            </button>
            {preview.errors + preview.skipped > 0 && <span className="text-sm opacity-70">Dòng lỗi và dòng bỏ qua sẽ không được ghi.</span>}
          </div>
        </div>
      )}
    </section>
  );
}
