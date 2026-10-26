import type { Metadata } from "next";
import { ScoreLocksManager } from "@/features/scores";

export const metadata: Metadata = { title: "Hạn nhập và khoá sổ" };

export default function ScoreLocksPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Hạn nhập điểm, khoá sổ và công thức điểm</h1>
      <ScoreLocksManager />
    </div>
  );
}
