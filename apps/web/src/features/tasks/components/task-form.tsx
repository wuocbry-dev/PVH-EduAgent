"use client";

import { TASK_PRIORITIES, TASK_PRIORITY_NAMES, type TaskAssigneeDto, type TaskDto, type TaskPriority } from "@pvh/shared";
import { useState, type FormEvent } from "react";
import { fromDateTimeLocal, toDateTimeLocal } from "@/shared/lib/format";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { createTask, updateTask } from "../api/tasks-api";

interface Props {
  // Có `task` thì là sửa, không thì là giao việc mới.
  task?: TaskDto;
  assignees: TaskAssigneeDto[];
  onSaved: () => void;
  onCancel: () => void;
}

// Giao việc mới hoặc sửa việc (đổi người phụ trách, đổi hạn): chỉ người có task:assign thấy form này.
export function TaskForm({ task, assignees, onSaved, onCancel }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      description: String(form.get("description")) || null,
      assigneeId: String(form.get("assigneeId")),
      priority: String(form.get("priority")) as TaskPriority,
      dueAt: fromDateTimeLocal(String(form.get("dueAt"))),
    };
    setPending(true);
    setError(null);
    try {
      if (task) await updateTask(task.id, body);
      else await createTask(body);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded border border-black/10 p-4 dark:border-white/15">
      <h2 className="text-lg font-semibold">{task ? "Sửa công việc" : "Giao việc mới"}</h2>
      <label className="block space-y-1 text-sm">
        <span>Tên công việc</span>
        <input name="title" defaultValue={task?.title} required maxLength={255} className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Mô tả</span>
        <textarea name="description" defaultValue={task?.description ?? ""} rows={3} maxLength={5000} className={inputClass} />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span>Người phụ trách</span>
          <select name="assigneeId" defaultValue={task?.assigneeId ?? ""} required className={inputClass}>
            <option value="" disabled>
              — Chọn người —
            </option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.fullName}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span>Mức ưu tiên</span>
          <select name="priority" defaultValue={task?.priority ?? "MEDIUM"} className={inputClass}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {TASK_PRIORITY_NAMES[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Hạn chót</span>
        <input
          name="dueAt"
          type="datetime-local"
          defaultValue={task ? toDateTimeLocal(task.dueAt) : ""}
          required
          className={inputClass}
        />
      </label>
      {error && <p className={errorClass}>{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className={`${buttonClass} w-auto`}>
          {task ? "Lưu thay đổi" : "Giao việc"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-black/20 px-4 py-2 dark:border-white/20">
          Hủy
        </button>
      </div>
    </form>
  );
}
