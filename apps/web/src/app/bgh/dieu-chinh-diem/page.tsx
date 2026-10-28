import type { Metadata } from "next";
import { AdjustmentReview } from "@/features/scores";

export const metadata: Metadata = { title: "Duyệt điều chỉnh điểm" };

export default function AdjustmentReviewPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Duyệt đề nghị điều chỉnh điểm</h1>
      <p className="max-w-3xl text-sm text-muted">Giáo viên gửi đề nghị khi muốn sửa điểm đã quá hạn nhập hoặc đã khoá sổ. Mọi lần duyệt đều được lưu vào lịch sử điểm.</p>
      <AdjustmentReview />
    </div>
  );
}
