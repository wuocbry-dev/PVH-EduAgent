import type { Metadata } from "next";
import { QuizList } from "@/features/quizzes";

export const metadata: Metadata = { title: "Trắc nghiệm ôn tập" };

export default function StudentQuizzesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Trắc nghiệm ôn tập</h1>
      <QuizList />
    </div>
  );
}
