"use client";

import { TIMETABLE_DAY_NAMES, type PlacementOptionDto, type TeachingAssignmentDto, type TimetableSlotDto } from "@pvh/shared";
import { useState } from "react";
import { ApiError } from "@/shared/lib/api-client";
import { useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { deleteSlot, getOptions, getSlots, listClassAssignments, moveSlot, placeSlot } from "../api/timetable-api";
import { errorText, smallButton, type EditorContext } from "./context";

// Tải lưới của một lớp trong một phiên bản. `key` = "phiênbản|lớp|năm|phânCôngĐangChọn|phòng" (chuỗi để useData so sánh ổn định).
async function loadGrid(key: string) {
  const [versionId, classId, yearId, assignmentId, roomId] = key.split("|");
  if (!versionId || !classId) return null;
  const [slots, assignments, options] = await Promise.all([
    getSlots(versionId, { classId }),
    listClassAssignments(classId, yearId!),
    assignmentId ? getOptions(versionId, assignmentId, roomId || undefined) : Promise.resolve([] as PlacementOptionDto[]),
  ]);
  return { slots, assignments, options };
}

// Thực hiện một thao tác xếp tiết; nếu giáo viên đã đăng ký bận thì hỏi xác nhận rồi gửi lại (ghi audit_logs ở máy chủ).
async function withUnavailableConfirm<T>(run: (confirmed: boolean) => Promise<T>): Promise<T | undefined> {
  try {
    return await run(false);
  } catch (err) {
    if (err instanceof ApiError && err.status === 409 && err.message.includes("confirmUnavailable")) {
      const message = err.message.replace(/\. Gửi confirmUnavailable=true.*$/, "");
      if (!confirm(`${message}.\n\nVẫn xếp đè lên tiết bận? (việc này được ghi nhật ký)`)) return undefined;
      return run(true);
    }
    throw err;
  }
}

export function GridTab({ ctx }: { ctx: EditorContext }) {
  const { frame, version, classes, rooms } = ctx;
  const editable = !ctx.readOnly && version?.status === "DRAFT";
  const [classId, setClassId] = useState("");
  const [assignmentId, setAssignmentId] = useState("");
  const [slotId, setSlotId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [hover, setHover] = useState<PlacementOptionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cls = classes.find((c) => c.id === (classId || classes[0]?.id));
  const activeClassId = cls?.id ?? "";
  const key = version && cls ? `${version.id}|${cls.id}|${cls.schoolYearId}|${assignmentId}|${roomId}` : "";
  const grid = useData(loadGrid, key);

  if (!version) return <p className="text-sm opacity-70">Chưa có phiên bản nào. Tạo một bản nháp ở tab «Phiên bản và công bố».</p>;

  const data = grid.data;
  // Phân công áp dụng cho học kỳ của phiên bản: cả năm hoặc đúng học kỳ.
  const assignments = (data?.assignments ?? []).filter((a) => a.semesterId === null || a.semesterId === version.semesterId);
  const slotAt = (day: number, period: number) => data?.slots.find((s) => s.day === day && s.period === period);
  const optionAt = (day: number, period: number) => data?.options.find((o) => o.day === day && o.period === period);
  const placed = (a: TeachingAssignmentDto) => data?.slots.filter((s) => s.assignmentId === a.id).length ?? 0;
  const selectedAssignment = assignments.find((a) => a.id === assignmentId);
  const selectedSlot = data?.slots.find((s) => s.id === slotId);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      grid.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function dropOrClick(day: number, period: number, dragged?: string) {
    if (!editable) return;
    const existing = slotAt(day, period);
    if (existing) {
      setSlotId(existing.id === slotId ? "" : existing.id);
      setAssignmentId("");
      return;
    }
    // Dời một tiết đã chọn (hoặc đang kéo)
    const moving = dragged?.startsWith("slot:") ? dragged.slice(5) : slotId;
    if (moving) {
      void run(async () => {
        await withUnavailableConfirm((confirmed) => moveSlot(moving, { day, period, confirmUnavailable: confirmed }));
        setSlotId("");
      });
      return;
    }
    const assignment = dragged?.startsWith("asg:") ? dragged.slice(4) : assignmentId;
    if (!assignment) return setError("Chọn một phân công ở danh sách bên trái (hoặc một tiết đã xếp để dời) trước.");
    const option = optionAt(day, period);
    if (option && !option.ok) return setError(option.blocking.join("; "));
    void run(() =>
      withUnavailableConfirm((confirmed) =>
        placeSlot(version!.id, { assignmentId: assignment, day, period, roomId: roomId || null, confirmUnavailable: confirmed }),
      ),
    );
  }

  const cellClass = (day: number, period: number, slot: TimetableSlotDto | undefined) => {
    if (slot) return slot.id === slotId ? "border-2 border-blue-600 bg-blue-500/20" : "bg-black/5 dark:bg-white/10";
    const o = optionAt(day, period);
    if (!o) return "";
    if (!o.ok) return "bg-red-500/15 opacity-70";
    return o.warnings.length > 0 ? "bg-yellow-500/25" : "bg-green-500/15";
  };

  return (
    <section className="space-y-3" aria-label="Xếp lịch">
      {!editable && (
        <p className="rounded border border-yellow-600/40 bg-yellow-500/10 p-2 text-sm">
          {ctx.readOnly
            ? "Bạn chỉ có quyền xem thời khoá biểu."
            : "Phiên bản đang chọn đã công bố nên chỉ xem. Muốn đổi lịch: tạo bản nháp từ bản này, sửa rồi công bố với ngày hiệu lực mới."}
        </p>
      )}
      {error && <p className={errorClass}>{error}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span>Lớp</span>
          <select
            value={activeClassId}
            onChange={(e) => {
              setClassId(e.target.value);
              setAssignmentId("");
              setSlotId("");
            }}
            className={`${inputClass} w-auto`}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.schoolYearName})
              </option>
            ))}
          </select>
        </label>
        {editable && (
          <label className="space-y-1 text-sm">
            <span>Phòng bộ môn (tuỳ chọn)</span>
            <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={`${inputClass} w-auto`}>
              <option value="">Không dùng phòng bộ môn</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
        <aside aria-label="Phân công của lớp" className="space-y-2">
          <h2 className="text-sm font-semibold">Phân công của lớp</h2>
          <ul className="space-y-1">
            {assignments.map((a) => {
              const n = placed(a);
              const missing = a.periodsPerWeek - n;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    disabled={!editable}
                    draggable={editable}
                    onDragStart={(e) => {
                      e.dataTransfer.setData("text/plain", `asg:${a.id}`);
                      setAssignmentId(a.id);
                      setSlotId("");
                    }}
                    onClick={() => {
                      setAssignmentId(a.id === assignmentId ? "" : a.id);
                      setSlotId("");
                    }}
                    aria-pressed={a.id === assignmentId}
                    className={`w-full rounded border px-2 py-1 text-left text-sm disabled:opacity-100 ${
                      a.id === assignmentId ? "border-2 border-blue-600" : "border-black/20 dark:border-white/20"
                    } ${missing > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}
                  >
                    <span className="block font-medium">{a.subjectName}</span>
                    <span className="block text-xs opacity-80">
                      {a.teacherName} · {n}/{a.periodsPerWeek} tiết{missing > 0 ? ` (thiếu ${missing})` : ""}
                    </span>
                  </button>
                </li>
              );
            })}
            {assignments.length === 0 && <li className="text-sm opacity-70">Lớp chưa có phân công giảng dạy trong học kỳ này.</li>}
          </ul>
          {editable && (
            <p className="text-xs opacity-70">
              Chọn một phân công (hoặc kéo nó) rồi bấm ô trên lưới: ô <span className="rounded bg-green-500/30 px-1">xanh</span> đặt được,{" "}
              <span className="rounded bg-yellow-500/40 px-1">vàng</span> cần xác nhận (giáo viên báo bận), <span className="rounded bg-red-500/30 px-1">đỏ</span> không đặt
              được. Bấm một tiết đã xếp để dời hoặc xoá; có thể dùng phím Tab và Enter.
            </p>
          )}
          {selectedSlot && editable && (
            <div className="space-y-2 rounded border border-blue-600 p-2 text-sm">
              <p>
                Đang chọn <strong>{selectedSlot.subjectName}</strong> ({TIMETABLE_DAY_NAMES[selectedSlot.day]} tiết {selectedSlot.period}). Bấm ô trống để dời.
              </p>
              <div className="flex gap-2">
                <button type="button" className={smallButton} onClick={() => run(async () => { await deleteSlot(selectedSlot.id); setSlotId(""); })}>
                  Xoá tiết
                </button>
                <button type="button" className={smallButton} onClick={() => setSlotId("")}>
                  Bỏ chọn
                </button>
              </div>
            </div>
          )}
        </aside>

        <div className="space-y-2">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-24 border border-black/10 p-1 dark:border-white/15" />
                  {frame.days.map((d) => (
                    <th key={d} className="border border-black/10 p-1 dark:border-white/15">
                      {TIMETABLE_DAY_NAMES[d]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {frame.periods.map((p) => (
                  <tr key={p.no}>
                    <th className="border border-black/10 p-1 text-left font-normal dark:border-white/15">
                      Tiết {p.no}
                      <span className="block text-xs opacity-70">
                        {p.start}–{p.end}
                      </span>
                    </th>
                    {frame.days.map((d) => {
                      const slot = slotAt(d, p.no);
                      const option = optionAt(d, p.no);
                      return (
                        <td key={d} className="border border-black/10 p-0 dark:border-white/15">
                          <button
                            type="button"
                            disabled={!editable && !slot}
                            draggable={editable && !!slot}
                            onDragStart={(e) => slot && e.dataTransfer.setData("text/plain", `slot:${slot.id}`)}
                            onDragOver={(e) => editable && e.preventDefault()}
                            onDrop={(e) => {
                              e.preventDefault();
                              dropOrClick(d, p.no, e.dataTransfer.getData("text/plain"));
                            }}
                            onClick={() => dropOrClick(d, p.no)}
                            onMouseEnter={() => setHover(option ?? null)}
                            onFocus={() => setHover(option ?? null)}
                            title={option && !option.ok ? option.blocking.join("; ") : option?.warnings.join("; ")}
                            aria-label={`${TIMETABLE_DAY_NAMES[d]} tiết ${p.no}${slot ? `: ${slot.subjectName}` : ""}`}
                            className={`block h-14 w-full p-1 text-left align-top disabled:cursor-default ${cellClass(d, p.no, slot)}`}
                          >
                            {slot && (
                              <>
                                <span className="block truncate font-medium">{slot.subjectName}</span>
                                <span className="block truncate text-xs opacity-80">
                                  {slot.teacherName}
                                  {slot.roomName ? ` · ${slot.roomName}` : ""}
                                </span>
                              </>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="min-h-5 text-sm" aria-live="polite">
            {hover && (hover.blocking.length > 0 || hover.warnings.length > 0)
              ? `${TIMETABLE_DAY_NAMES[hover.day]} tiết ${hover.period}: ${[...hover.blocking, ...hover.warnings].join("; ")}`
              : selectedAssignment && hover
                ? `${TIMETABLE_DAY_NAMES[hover.day]} tiết ${hover.period}: đặt được`
                : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
