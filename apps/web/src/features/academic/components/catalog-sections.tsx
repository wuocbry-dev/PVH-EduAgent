"use client";

import { GRADING_TYPE_NAMES, GRADING_TYPES, type GradingType } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  createDepartment,
  createRoom,
  createSubject,
  deleteDepartment,
  deleteRoom,
  deleteSubject,
  listDepartments,
  listRooms,
  listSubjects,
  updateDepartment,
  updateRoom,
  updateSubject,
} from "../api/academic-api";
import { errorText, useData } from "./use-data";

const smallButton = "rounded border border-black/20 px-3 py-1 text-sm dark:border-white/20";
const submitButton = "rounded bg-foreground px-4 py-2 text-background";

// Chạy một thao tác, báo lỗi tiếng Việt từ API và tải lại danh sách khi xong.
function useRunner(reload: () => void) {
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }
  return { error, run };
}

export function DepartmentSection() {
  const departments = useData(listDepartments, undefined);
  const { error, run } = useRunner(departments.reload);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    void run(async () => {
      await createDepartment(String(new FormData(form).get("name")).trim());
      form.reset();
    });
  }

  return (
    <section className="space-y-4" aria-label="Tổ chuyên môn">
      {(error ?? departments.error) && <p className={errorClass}>{error ?? departments.error}</p>}
      <ul className="space-y-2 text-sm">
        {departments.data?.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-3">
            <span className="min-w-56 font-medium">{d.name}</span>
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                const name = prompt("Tên tổ mới:", d.name)?.trim();
                if (name && name !== d.name) void run(() => updateDepartment(d.id, name));
              }}
            >
              Đổi tên
            </button>
            <button type="button" className={smallButton} onClick={() => confirm(`Xóa ${d.name}?`) && run(() => deleteDepartment(d.id))}>
              Xóa
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span>Tên tổ chuyên môn</span>
          <input name="name" required maxLength={100} className={`${inputClass} w-64`} />
        </label>
        <button type="submit" className={submitButton}>
          Thêm tổ
        </button>
      </form>
    </section>
  );
}

export function SubjectSection() {
  const subjects = useData(listSubjects, undefined);
  const departments = useData(listDepartments, undefined);
  const { error, run } = useRunner(subjects.reload);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createSubject({
        code: String(data.get("code")).trim(),
        name: String(data.get("name")).trim(),
        departmentId: String(data.get("departmentId")) || null,
        gradingType: String(data.get("gradingType")) as GradingType,
      });
      form.reset();
    });
  }

  return (
    <section className="space-y-4" aria-label="Môn học">
      {(error ?? subjects.error) && <p className={errorClass}>{error ?? subjects.error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-4">Mã</th>
              <th className="py-2 pr-4">Tên môn</th>
              <th className="py-2 pr-4">Tổ chuyên môn</th>
              <th className="py-2 pr-4">Đánh giá</th>
              <th className="py-2">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {subjects.data?.map((s) => (
              <tr key={s.id}>
                <td className="py-2 pr-4 font-mono">{s.code}</td>
                <td className="py-2 pr-4">{s.name}</td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Tổ của môn ${s.name}`}
                    value={s.departmentId ?? ""}
                    onChange={(e) => run(() => updateSubject(s.id, { departmentId: e.target.value || null }))}
                    className={`${inputClass} w-56`}
                  >
                    <option value="">— Chưa có —</option>
                    {departments.data?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 pr-4">
                  <select
                    aria-label={`Cách đánh giá môn ${s.name}`}
                    value={s.gradingType}
                    onChange={(e) => run(() => updateSubject(s.id, { gradingType: e.target.value as GradingType }))}
                    className={`${inputClass} w-36`}
                  >
                    {GRADING_TYPES.map((g) => (
                      <option key={g} value={g}>
                        {GRADING_TYPE_NAMES[g]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="flex flex-wrap gap-2 py-2">
                  <button
                    type="button"
                    className={smallButton}
                    onClick={() => {
                      const name = prompt("Tên môn mới:", s.name)?.trim();
                      if (name && name !== s.name) void run(() => updateSubject(s.id, { name }));
                    }}
                  >
                    Đổi tên
                  </button>
                  <button type="button" className={smallButton} onClick={() => confirm(`Xóa môn ${s.name}?`) && run(() => deleteSubject(s.id))}>
                    Xóa
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span>Mã môn</span>
          <input name="code" required maxLength={20} className={`${inputClass} w-28`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Tên môn</span>
          <input name="name" required maxLength={100} className={`${inputClass} w-56`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Tổ chuyên môn</span>
          <select name="departmentId" className={`${inputClass} w-56`}>
            <option value="">— Chưa có —</option>
            {departments.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Đánh giá</span>
          <select name="gradingType" className={`${inputClass} w-36`}>
            {GRADING_TYPES.map((g) => (
              <option key={g} value={g}>
                {GRADING_TYPE_NAMES[g]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={submitButton}>
          Thêm môn
        </button>
      </form>
    </section>
  );
}

export function RoomSection() {
  const rooms = useData(listRooms, undefined);
  const { error, run } = useRunner(rooms.reload);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    void run(async () => {
      await createRoom({ name: String(data.get("name")).trim(), kind: String(data.get("kind")).trim() || null });
      form.reset();
    });
  }

  return (
    <section className="space-y-4" aria-label="Phòng bộ môn">
      <p className="text-sm opacity-70">Chỉ phòng bộ môn (Tin học, thí nghiệm, nhà/sân thể chất…), không quản lý từng phòng học thường.</p>
      {(error ?? rooms.error) && <p className={errorClass}>{error ?? rooms.error}</p>}
      <ul className="space-y-2 text-sm">
        {rooms.data?.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3">
            <span className="min-w-56 font-medium">{r.name}</span>
            <span className="min-w-28 opacity-70">{r.kind ?? ""}</span>
            <button
              type="button"
              className={smallButton}
              onClick={() => {
                const name = prompt("Tên phòng mới:", r.name)?.trim();
                if (name && name !== r.name) void run(() => updateRoom(r.id, { name }));
              }}
            >
              Đổi tên
            </button>
            <button type="button" className={smallButton} onClick={() => confirm(`Xóa ${r.name}?`) && run(() => deleteRoom(r.id))}>
              Xóa
            </button>
          </li>
        ))}
      </ul>
      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span>Tên phòng</span>
          <input name="name" required maxLength={100} className={`${inputClass} w-64`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Loại (tuỳ chọn)</span>
          <input name="kind" maxLength={50} placeholder="Tin học, Thí nghiệm…" className={`${inputClass} w-48`} />
        </label>
        <button type="submit" className={submitButton}>
          Thêm phòng
        </button>
      </form>
    </section>
  );
}
