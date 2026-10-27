import type { Metadata } from "next";
import { QuizManager } from "@/features/quizzes";

export const metadata: Metadata = { title: "Trắc nghiệm ôn tập" };

export default function Page() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Trắc nghiệm ôn tập</h1>
      <QuizManager />
    </div>
  );
}
