"use client";

import {
  SETTABLE_TASK_STATUSES,
  TASK_PRIORITY_NAMES,
  TASK_STATUS_NAMES,
  TASK_STATUSES,
  type AuthMeDto,
  type SettableTaskStatus,
  type TaskAssigneeDto,
  type TaskDto,
} from "@pvh/shared";
import { useEffect, useState } from "react";
import { api } from "@/shared/lib/api-client";
import { formatDateTime } from "@/shared/lib/format";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  deleteTask,
  listAssignees,
  listTasks,
  setTaskStatus,
  type TaskFilters,
} from "../api/tasks-api";
import { TaskForm } from "./task-form";

type Editing = { mode: "create" } | { mode: "edit"; task: TaskDto } | null;

const EMPTY_FILTERS: TaskFilters = { assigneeId: "", status: "", dueFrom: "", dueTo: "" };
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// F14 – công việc và hạn chót. Giáo viên (chỉ task:read:own) chỉ thấy việc của mình; người có task:assign giao/sửa/xóa.
export function TaskManager() {
  const [me, setMe] = useState<AuthMeDto | null>(null);
  const [assignees, setAssignees] = useState<TaskAssigneeDto[]>([]);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [tasks, setTasks] = useState<TaskDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [version, setVersion] = useState(0);

  const canAssign = me?.permissions.includes("task:assign") ?? false;
  const canSeeAll = me?.permissions.includes("task:read:all") ?? false;

  useEffect(() => {
    let current = true;
    api<AuthMeDto>("/auth/me")
      .then(async (user) => {
        if (!current) return;
        setMe(user);
        if (user.permissions.includes("task:assign") || user.permissions.includes("task:read:all")) {
          const list = await listAssignees();
          if (current) setAssignees(list);
        }
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    let current = true;
    listTasks(filters)
      .then((data) => {
        if (!current) return;
        setTasks(data);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [filters, version]);

  const reload = () => setVersion((v) => v + 1);
  const setFilter = (patch: Partial<TaskFilters>) => setFilters((f) => ({ ...f, ...patch }));

  async function changeStatus(task: TaskDto, status: SettableTaskStatus) {
    setError(null);
    try {
      const updated = await setTaskStatus(task.id, status);
      setTasks((cur) => cur && cur.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(task: TaskDto) {
    if (!confirm(`Xóa công việc "${task.title}"?`)) return;
    setError(null);
    try {
      await deleteTask(task.id);
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-2">
          {canSeeAll && (
            <label className="space-y-1 text-xs">
              <span className="block">Người phụ trách</span>
              <select
                value={filters.assigneeId}
                onChange={(e) => setFilter({ assigneeId: e.target.value })}
                className={`${inputClass} w-auto`}
              >
                <option value="">Tất cả</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="space-y-1 text-xs">
            <span className="block">Trạng thái</span>
            <select
              value={filters.status}
              onChange={(e) => setFilter({ status: e.target.value as TaskFilters["status"] })}
              className={`${inputClass} w-auto`}
            >
              <option value="">Tất cả</option>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_NAMES[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs">
            <span className="block">Hạn từ ngày</span>
            <input type="date" value={filters.dueFrom} onChange={(e) => setFilter({ dueFrom: e.target.value })} className={`${inputClass} w-auto`} />
          </label>
          <label className="space-y-1 text-xs">
            <span className="block">đến ngày</span>
            <input type="date" value={filters.dueTo} onChange={(e) => setFilter({ dueTo: e.target.value })} className={`${inputClass} w-auto`} />
          </label>
          <button type="button" onClick={() => setFilters(EMPTY_FILTERS)} className="rounded border border-black/20 px-3 py-2 text-sm dark:border-white/20">
            Xóa lọc
          </button>
        </div>
        {canAssign && (
          <button type="button" onClick={() => setEditing({ mode: "create" })} className="rounded bg-foreground px-4 py-2 text-background">
            Giao việc mới
          </button>
        )}
      </div>

      {editing && canAssign && (
        <TaskForm
          key={editing.mode === "edit" ? editing.task.id : "create"}
          task={editing.mode === "edit" ? editing.task : undefined}
          assignees={assignees}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {error && <p className={errorClass}>{error}</p>}
      {tasks === null && !error && <p className="text-sm opacity-60">Đang tải…</p>}

      {tasks && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15">
              <tr>
                <th className="py-2 pr-4">Công việc</th>
                <th className="py-2 pr-4">Phụ trách</th>
                <th className="py-2 pr-4">Ưu tiên</th>
                <th className="py-2 pr-4">Hạn chót</th>
                <th className="py-2 pr-4">Trạng thái</th>
                {canAssign && <th className="py-2">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/15">
              {tasks.map((task) => {
                const mayChange = task.assigneeId === me?.id || canAssign;
                return (
                  <tr key={task.id} className={task.status === "DONE" ? "opacity-60" : ""}>
                    <td className="py-2 pr-4">
                      <span className="font-medium">{task.title}</span>
                      {task.description && <span className="block text-xs opacity-70">{task.description}</span>}
                      <span className="block text-xs opacity-50">Giao bởi {task.createdByName}</span>
                    </td>
                    <td className="py-2 pr-4">{task.assigneeName}</td>
                    <td className="py-2 pr-4">{TASK_PRIORITY_NAMES[task.priority]}</td>
                    <td className={`py-2 pr-4 ${task.overdue ? "font-semibold text-red-600" : ""}`}>
                      {task.overdue && "Quá hạn · "}
                      {formatDateTime(task.dueAt)}
                      {task.completedAt && <span className="block text-xs font-normal opacity-70">Xong {formatDateTime(task.completedAt)}</span>}
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={task.status}
                        disabled={!mayChange}
                        onChange={(e) => changeStatus(task, e.target.value as SettableTaskStatus)}
                        aria-label={`Trạng thái: ${task.title}`}
                        className={`${inputClass} w-auto py-1 text-sm`}
                      >
                        {task.status === "OVERDUE" && (
                          <option value="OVERDUE" disabled>
                            {TASK_STATUS_NAMES.OVERDUE}
                          </option>
                        )}
                        {SETTABLE_TASK_STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {TASK_STATUS_NAMES[s]}
                          </option>
                        ))}
                      </select>
                    </td>
                    {canAssign && (
                      <td className="flex gap-3 py-2">
                        <button type="button" className="underline" onClick={() => setEditing({ mode: "edit", task })}>
                          Sửa
                        </button>
                        <button type="button" className="underline" onClick={() => remove(task)}>
                          Xóa
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {tasks.length === 0 && (
                <tr>
                  <td colSpan={canAssign ? 6 : 5} className="py-4 opacity-70">
                    Không có công việc nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
