"use client";

import { ROSTER_MAX_BYTES, type RosterConfirmDto, type RosterKind, type RosterPreviewDto, type RosterRowStatus } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { confirmRoster, downloadTemplate, previewRoster } from "../api/roster-api";
import { SlipSheet } from "./slip-sheet";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

const STATUS_LABEL: Record<RosterRowStatus, string> = { ok: "Hợp lệ", skip: "Bỏ qua", error: "Lỗi" };
const STATUS_CLASS: Record<RosterRowStatus, string> = {
  ok: "",
  skip: "bg-yellow-500/10",
  error: "bg-red-500/10",
};

export function RosterImport() {
  const [kind, setKind] = useState<RosterKind>("STUDENT");
  const [preview, setPreview] = useState<RosterPreviewDto | null>(null);
  const [result, setResult] = useState<RosterConfirmDto | null>(null);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onPreview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const file = new FormData(e.currentTarget).get("file");
    if (!(file instanceof File) || file.size === 0) return setError("Chưa chọn file Excel (.xlsx)");
    if (file.size > ROSTER_MAX_BYTES) return setError(`File quá lớn (tối đa ${ROSTER_MAX_BYTES / 1024 / 1024} MB)`);
    setPending(true);
    setError(null);
    setResult(null);
    try {
      setPreview(await previewRoster(kind, file));
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
      setResult(await confirmRoster(preview.previewId));
      setPreview(null);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const rows = preview?.rows.filter((r) => !onlyProblems || r.status !== "ok") ?? [];

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
        <form onSubmit={onPreview} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span>Danh sách</span>
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as RosterKind);
                setPreview(null);
              }}
              className={`${inputClass} w-auto`}
            >
              <option value="STUDENT">Học sinh</option>
              <option value="TEACHER">Giáo viên</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>File Excel (.xlsx, tối đa 2 MB, 3000 dòng)</span>
            <input
              name="file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className={inputClass}
            />
          </label>
          <button type="submit" disabled={pending} className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50">
            {pending && !preview ? "Đang đọc file…" : "Xem trước"}
          </button>
          <button
            type="button"
            onClick={() => downloadTemplate(kind).catch((err) => setError(errorText(err)))}
            className="rounded border border-black/20 px-4 py-2 dark:border-white/20"
          >
            Tải file mẫu
          </button>
        </form>

        <p className="max-w-3xl text-sm opacity-70">
          File mẫu chỉ có dữ liệu giả. Dữ liệu học sinh thật là dữ liệu cá nhân (có em dưới 16 tuổi): chỉ nhập khi nhà trường cho phép. Hệ
          thống chỉ lưu mã, họ tên, lớp, ngày sinh và giới tính (tuỳ chọn).
        </p>

        {error && <p className={errorClass}>{error}</p>}

        {preview && (
          <section className="space-y-3" aria-label="Xem trước">
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>
                Tổng <strong>{preview.total}</strong> dòng
              </span>
              <span className="text-green-700 dark:text-green-400">
                Hợp lệ <strong>{preview.ok}</strong>
              </span>
              <span>
                Bỏ qua (đã có) <strong>{preview.skipped}</strong>
              </span>
              <span className={preview.errors > 0 ? "text-red-600" : ""}>
                Lỗi <strong>{preview.errors}</strong>
              </span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} />
                Chỉ hiện dòng lỗi/bỏ qua
              </label>
            </div>
            <div className="max-h-[28rem] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 border-b border-black/10 bg-background dark:border-white/15">
                  <tr>
                    <th className="py-2 pr-3">Dòng</th>
                    <th className="py-2 pr-3">Kết quả</th>
                    <th className="py-2 pr-3">Mã</th>
                    <th className="py-2 pr-3">Họ tên</th>
                    <th className="py-2 pr-3">{kind === "STUDENT" ? "Lớp" : "Chủ nhiệm"}</th>
                    {kind === "TEACHER" && <th className="py-2 pr-3">Email</th>}
                    <th className="py-2">Ghi chú</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/10 dark:divide-white/15">
                  {rows.map((r) => (
                    <tr key={r.row} className={STATUS_CLASS[r.status]}>
                      <td className="py-1 pr-3">{r.row}</td>
                      <td className="py-1 pr-3">{STATUS_LABEL[r.status]}</td>
                      <td className="py-1 pr-3 font-mono">{r.code}</td>
                      <td className="py-1 pr-3">{r.fullName}</td>
                      <td className="py-1 pr-3">{r.className ?? ""}</td>
                      {kind === "TEACHER" && <td className="py-1 pr-3 break-all">{r.email ?? ""}</td>}
                      <td className="py-1">{r.messages.join("; ")}</td>
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
                className="rounded bg-foreground px-4 py-2 text-background disabled:opacity-50"
              >
                {pending ? "Đang tạo tài khoản…" : `Xác nhận tạo ${preview.ok} tài khoản`}
              </button>
              {preview.errors + preview.skipped > 0 && (
                <span className="text-sm opacity-70">Các dòng lỗi và dòng bỏ qua sẽ không được tạo.</span>
              )}
            </div>
          </section>
        )}

        {result && (
          <section className="space-y-3" aria-label="Kết quả">
            <p className="text-sm">
              Đã tạo <strong>{result.created}</strong> tài khoản (bỏ qua {result.skipped} dòng).
            </p>
            {result.slips.length > 0 && (
              <>
                <p className="max-w-3xl rounded border border-yellow-600/40 bg-yellow-500/10 p-3 text-sm">
                  <strong>Mã kích hoạt chỉ hiện một lần ngay bây giờ</strong> và không xem lại được. Hãy in phiếu hoặc lưu thành PDF trước khi
                  rời trang. Mất phiếu thì cấp lại mã ở trang Người dùng.
                </p>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="rounded bg-foreground px-4 py-2 text-background"
                >
                  In phiếu tài khoản
                </button>
              </>
            )}
          </section>
        )}
      </div>

      {result && result.slips.length > 0 && <SlipSheet slips={result.slips} />}
    </div>
  );
}
