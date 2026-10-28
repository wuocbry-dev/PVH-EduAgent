import type { Metadata } from "next";
import { Inbox } from "@/features/announcements";

export const metadata: Metadata = { title: "Thông báo" };

export default function StudentInboxPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Thông báo</h1>
      <p className="max-w-3xl text-sm text-muted">Thông báo của trường, khối và lớp em, cùng các thông báo tự động (có điểm mới, thời khoá biểu thay đổi…).</p>
      <Inbox />
    </div>
  );
}
