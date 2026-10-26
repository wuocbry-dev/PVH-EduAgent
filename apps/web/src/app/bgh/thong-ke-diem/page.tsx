import type { Metadata } from "next";
import { PrincipalScoreStats } from "@/features/scores";

export const metadata: Metadata = { title: "Xem và thống kê điểm" };

export default function PrincipalScoreStatsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Xem và thống kê điểm</h1>
      <PrincipalScoreStats />
    </div>
  );
}
