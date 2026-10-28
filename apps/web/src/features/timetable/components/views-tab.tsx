"use client";

import { TIMETABLE_DAY_NAMES, type TimetableFrameDto, type TimetableSlotDto } from "@pvh/shared";
import { useState } from "react";
import { useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { downloadExport, getSlots, getStats } from "../api/timetable-api";
import { errorText, smallButton, type EditorContext } from "./context";
import { EmptyState, Table } from "@/shared/ui";

type Mode = "class" | "teacher" | "room";

// Chưa chọn phiên bản thì không gọi API.
const loadStats = (versionId: string) => (versionId ? getStats(versionId) : Promise.resolve(null));

async function loadSlots(key: string) {
  const [versionId, mode, id] = key.split("|");
  if (!versionId || !id) return [] as TimetableSlotDto[];
  return getSlots(versionId, { [`${mode}Id`]: id });
}

function StaticGrid({ frame, slots, mode }: { frame: TimetableFrameDto; slots: TimetableSlotDto[]; mode: Mode }) {
  return (
    <Table className="min-w-[640px] table-fixed" stickyFirstColumn>
      <thead>
        <tr>
          <th className="w-24 border border-border p-1" />
          {frame.days.map((d) => (
            <th key={d} className="border border-border p-1">
              {TIMETABLE_DAY_NAMES[d]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {frame.periods.map((p) => (
          <tr key={p.no}>
            <th className="border border-border p-1 text-left font-normal">Tiết {p.no}</th>
            {frame.days.map((d) => (
              <td key={d} className="border border-border p-1 align-top">
                {slots
                  .filter((s) => s.day === d && s.period === p.no)
                  .map((s) => (
                    <div key={s.id} className="leading-tight">
                      <p className="font-medium">{s.subjectName}</p>
                      <p className="text-xs text-muted">
                        {mode === "class" ? s.teacherName : s.className}
                        {mode === "room" ? ` · ${s.teacherName}` : ""}
                        {mode !== "room" && s.roomName ? ` · ${s.roomName}` : ""}
                      </p>
                    </div>
                  ))}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

// Xem một phiên bản theo lớp, theo giáo viên hoặc theo phòng (để phát hiện chỗ dồn tiết); xuất Excel.
export function ViewsTab({ ctx }: { ctx: EditorContext }) {
  const { version, frame } = ctx;
  const [mode, setMode] = useState<Mode>("teacher");
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const options =
    mode === "class"
      ? ctx.classes.map((c) => ({ id: c.id, label: `${c.name} (${c.schoolYearName})` }))
      : mode === "teacher"
        ? ctx.teachers.map((t) => ({ id: t.userId, label: `${t.fullName} (${t.teacherCode})` }))
        : ctx.rooms.map((r) => ({ id: r.id, label: r.name }));
  const activeId = options.some((o) => o.id === id) ? id : (options[0]?.id ?? "");
  const slots = useData(loadSlots, version ? `${version.id}|${mode}|${activeId}` : "");
  const stats = useData(loadStats, version?.id ?? "");

  if (!version) return <EmptyState>Chưa có phiên bản nào.</EmptyState>;

  const teacherStats = mode === "teacher" ? stats.data?.teachers.find((t) => t.teacherId === activeId) : undefined;

  return (
    <section className="space-y-3" aria-label="Xem lịch">
      {(error ?? slots.error) && <p className={errorClass}>{error ?? slots.error}</p>}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <label className="space-y-1 text-sm">
          <span>Xem theo</span>
          <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={`${inputClass} w-auto`}>
            <option value="teacher">Giáo viên</option>
            <option value="class">Lớp</option>
            <option value="room">Phòng bộ môn</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>{mode === "teacher" ? "Giáo viên" : mode === "class" ? "Lớp" : "Phòng"}</span>
          <select value={activeId} onChange={(e) => setId(e.target.value)} className={`${inputClass} w-64`}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className={smallButton} onClick={() => window.print()}>
          In
        </button>
        {mode !== "room" && activeId && (
          <button type="button" className={smallButton} onClick={() => downloadExport(mode, activeId, version.id).catch((e) => setError(errorText(e)))}>
            Xuất Excel ({mode === "class" ? "lớp" : "giáo viên"})
          </button>
        )}
        <button type="button" className={smallButton} onClick={() => downloadExport("school", undefined, version.id).catch((e) => setError(errorText(e)))}>
          Xuất Excel toàn trường
        </button>
      </div>
      <StaticGrid frame={frame} slots={slots.data ?? []} mode={mode} />
      {teacherStats && (
        <p className="text-sm">
          Tổng {teacherStats.total} tiết/tuần.{" "}
          {teacherStats.days.map((d) => `${TIMETABLE_DAY_NAMES[d.day]}: ${d.periods} tiết${d.gaps > 0 ? ` (${d.gaps} tiết trống xen kẽ)` : ""}`).join(" · ")}
        </p>
      )}
    </section>
  );
}

