import { getDeadlines } from "../api/get-deadlines";
import { EmptyState } from "@/shared/ui";

// Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function DeadlineList() {
  const tasks = await getDeadlines();

  if (tasks.length === 0) {
    return <EmptyState>Không có việc nào sắp đến hạn.</EmptyState>;
  }

  return (
    <ul className="divide-y divide-border">
      {tasks.map((task) => (
        <li key={task.id} className="flex items-center justify-between gap-4 py-3">
          <span>
            {task.title}
            <span className="ml-2 text-xs text-muted">{task.assigneeName}</span>
          </span>
          <span className={`text-sm ${task.overdue ? "font-semibold text-danger" : "text-muted"}`}>
            {task.overdue ? "Quá hạn · " : ""}
            {new Date(task.dueAt).toLocaleString("vi-VN")}
          </span>
        </li>
      ))}
    </ul>
  );
}
