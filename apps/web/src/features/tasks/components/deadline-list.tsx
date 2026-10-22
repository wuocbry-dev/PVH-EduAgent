import { getDeadlines } from "../api/get-deadlines";

export async function DeadlineList({ devUserEmail }: { devUserEmail: string }) {
  const tasks = await getDeadlines(devUserEmail);

  if (tasks.length === 0) {
    return <p className="text-sm opacity-70">Không có việc nào sắp đến hạn.</p>;
  }

  return (
    <ul className="divide-y divide-black/10 dark:divide-white/15">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center justify-between gap-4 py-3">
          <span>
            {task.title}
            <span className="ml-2 text-xs opacity-60">{task.assigneeName}</span>
          </span>
          <span className={`text-sm ${task.overdue ? "font-semibold text-red-600" : "opacity-70"}`}>
            {task.overdue ? "Quá hạn · " : ""}
            {new Date(task.dueAt).toLocaleString("vi-VN")}
          </span>
        </li>
      ))}
    </ul>
  );
}
