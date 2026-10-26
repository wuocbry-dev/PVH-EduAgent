import type { Metadata } from "next";
import { StudentScores } from "@/features/scores";

export const metadata: Metadata = { title: "Điểm của em" };

export default function StudentScoresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Điểm của em</h1>
      <p className="max-w-3xl text-sm opacity-70">Em chỉ thấy điểm của chính mình, sau khi thầy cô công bố. Rê chuột (hoặc nhấn giữ) vào một cột điểm để xem mã đợt kiểm tra và ngày kiểm tra.</p>
      <StudentScores />
    </div>
  );
}
