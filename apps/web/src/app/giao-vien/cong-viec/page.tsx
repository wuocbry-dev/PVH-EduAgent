import type { Metadata } from "next";
import { TaskManager } from "@/features/tasks";

export const metadata: Metadata = { title: "Công việc" };

export default function TasksPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Việc của tôi</h1>
      <TaskManager />
    </div>
  );
}
