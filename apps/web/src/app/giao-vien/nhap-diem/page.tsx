import type { Metadata } from "next";
import { TeacherScores } from "@/features/scores";

export const metadata: Metadata = { title: "Nhập điểm" };

export default function TeacherScoresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nhập điểm</h1>
      <p className="max-w-3xl text-sm text-muted">
        Điểm là dữ liệu nhạy cảm: mỗi điểm gắn với một đợt kiểm tra có mã, mọi lần sửa đều được lưu lịch sử. Học sinh chỉ xem được
        điểm sau khi bạn công bố cho lớp.
      </p>
      <TeacherScores />
    </div>
  );
}
