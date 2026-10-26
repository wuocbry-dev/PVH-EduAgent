import type { Metadata } from "next";
import { PrincipalScores } from "@/features/scores";

export const metadata: Metadata = { title: "Đợt thi và điểm" };

export default function PrincipalScoresPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Đợt thi và tiến độ nhập điểm</h1>
      <PrincipalScores />
    </div>
  );
}
