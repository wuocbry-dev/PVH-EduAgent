"use client";

import { TIMETABLE_DAY_NAMES, TIMETABLE_STATUS_NAMES, type TimetableVersionDto } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { createVersion, deleteVersion, listUnavailability, publishVersion } from "../api/timetable-api";
import { errorText, smallButton, type EditorContext } from "./context";

const fmt = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "—");
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);

// Phiên bản thời khoá biểu: nháp → công bố có ngày hiệu lực → lưu trữ. Bản cũ vẫn dùng đến ngày hiệu lực của bản mới.
export function VersionsTab({ ctx }: { ctx: EditorContext }) {
  const [error, setError] = useState<string | null>(null);
  const [publishing, setPublishing] = useState<TimetableVersionDto | null>(null);
  const [date, setDate] = useState(today());
  const unavailable = useData(listUnavailability, undefined);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      ctx.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      const created = await createVersion({
        semesterId: String(data.get("semesterId")),
        name: String(data.get("name")).trim(),
        copyFromId: String(data.get("copyFromId")) || undefined,
      });
      ctx.selectVersion(created.id);
      form.reset();
    });
  }

  async function onPublish() {
    if (!publishing) return;
    setError(null);
    try {
      await publishVersion(publishing.id, date);
      setPublishing(null);
      ctx.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const byTeacher = new Map<string, { name: string; items: string[] }>();
  for (const u of unavailable.data ?? []) {
    const entry = byTeacher.get(u.teacherId) ?? { name: u.teacherName, items: [] };
    entry.items.push(`${TIMETABLE_DAY_NAMES[u.day]?.replace("Thứ ", "T")} t${u.period}${u.note ? ` (${u.note})` : ""}`);
    byTeacher.set(u.teacherId, entry);
  }

  return (
    <section className="space-y-5" aria-label="Phiên bản và công bố">
      {error && <p className={errorClass}>{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-3">Phiên bản</th>
              <th className="py-2 pr-3">Học kỳ</th>
              <th className="py-2 pr-3">Trạng thái</th>
              <th className="py-2 pr-3">Áp dụng từ</th>
              <th className="py-2 pr-3">Số tiết</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {ctx.versions.map((v) => (
              <tr key={v.id} className={v.id === ctx.version?.id ? "bg-black/5 dark:bg-white/10" : ""}>
                <td className="py-2 pr-3 font-medium">{v.name}</td>
                <td className="py-2 pr-3">
                  {v.semesterName} · {v.schoolYearName}
                </td>
                <td className="py-2 pr-3">{TIMETABLE_STATUS_NAMES[v.status]}</td>
                <td className="py-2 pr-3">
                  {fmt(v.effectiveDate)}
                  {v.publishedByName ? <span className="block text-xs opacity-60">bởi {v.publishedByName}</span> : null}
                </td>
                <td className="py-2 pr-3">{v.slotCount}</td>
                <td className="flex flex-wrap gap-2 py-2">
                  <button type="button" className={smallButton} onClick={() => ctx.selectVersion(v.id)}>
                    Chọn
                  </button>
                  {!ctx.readOnly && (
                    <>
                      <button
                        type="button"
                        className={smallButton}
                        onClick={() =>
                          run(async () => {
                            const copy = await createVersion({ semesterId: v.semesterId, name: `${v.name} (bản sửa)`, copyFromId: v.id });
                            ctx.selectVersion(copy.id);
                          })
                        }
                      >
                        Tạo bản nháp từ bản này
                      </button>
                      {v.status === "DRAFT" && (
                        <>
                          <button type="button" className={smallButton} onClick={() => { setPublishing(v); setError(null); }}>
                            Công bố…
                          </button>
                          <button type="button" className={smallButton} onClick={() => confirm(`Xoá bản nháp "${v.name}"?`) && run(() => deleteVersion(v.id))}>
                            Xoá
                          </button>
                        </>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
            {ctx.versions.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 opacity-70">
                  Chưa có phiên bản nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {publishing && (
        <div role="dialog" aria-label="Công bố thời khoá biểu" className="max-w-xl space-y-3 rounded border border-blue-600 p-4">
          <h2 className="text-lg font-semibold">Công bố «{publishing.name}»</h2>
          <p className="text-sm">
            Hệ thống kiểm tra lại toàn bộ (còn thiếu tiết thì chưa công bố được). Bản đang áp dụng vẫn dùng đến ngày hiệu lực; từ ngày đó mọi người
            thấy lịch mới và giáo viên được báo.
          </p>
          <label className="block space-y-1 text-sm">
            <span>Ngày hiệu lực</span>
            <input type="date" value={date} min={today()} onChange={(e) => setDate(e.target.value)} className={`${inputClass} w-auto`} />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={onPublish} className="rounded bg-foreground px-4 py-2 text-background">
              Xác nhận công bố
            </button>
            <button type="button" onClick={() => setPublishing(null)} className={smallButton}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {!ctx.readOnly && (
        <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2">
          <label className="space-y-1 text-sm">
            <span>Học kỳ</span>
            <select name="semesterId" className={`${inputClass} w-auto`}>
              {ctx.semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} (id {s.id})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Tên phiên bản</span>
            <input name="name" required maxLength={120} placeholder="TKB học kỳ I" className={`${inputClass} w-56`} />
          </label>
          <label className="space-y-1 text-sm">
            <span>Sao chép từ (tuỳ chọn)</span>
            <select name="copyFromId" className={`${inputClass} w-56`}>
              <option value="">Bản nháp trống</option>
              {ctx.versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="rounded bg-foreground px-4 py-2 text-background">
            Tạo bản nháp
          </button>
        </form>
      )}

      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Tiết bận giáo viên đã đăng ký</h2>
        <p className="text-sm opacity-70">Chỉ để tham khảo; xếp đè lên tiết bận cần xác nhận và được ghi nhật ký.</p>
        <ul className="max-h-60 space-y-1 overflow-y-auto text-sm">
          {[...byTeacher.values()].map((t) => (
            <li key={t.name}>
              <strong>{t.name}:</strong> {t.items.join(", ")}
            </li>
          ))}
          {byTeacher.size === 0 && <li className="opacity-70">Chưa có giáo viên nào đăng ký tiết bận.</li>}
        </ul>
      </div>
    </section>
  );
}
