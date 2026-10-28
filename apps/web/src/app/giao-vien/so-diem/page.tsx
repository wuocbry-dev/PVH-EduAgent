import type { Metadata } from "next";
import { TeacherGradebook } from "@/features/scores";

export const metadata: Metadata = { title: "Sổ điểm và lớp chủ nhiệm" };

export default function TeacherGradebookPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Sổ điểm và lớp chủ nhiệm</h1>
      <p className="max-w-3xl text-sm text-muted">Xem điểm và điểm trung bình các lớp–môn bạn dạy, bảng điểm lớp chủ nhiệm (chỉ điểm đã công bố) và đề nghị điều chỉnh điểm đã khoá.</p>
      <TeacherGradebook />
    </div>
  );
}
