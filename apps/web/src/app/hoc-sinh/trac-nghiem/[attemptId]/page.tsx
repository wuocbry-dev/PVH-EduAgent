import type { Metadata } from "next";
import { Suspense } from "react";
import { QuizRunner } from "@/features/quizzes";

export const metadata: Metadata = { title: "Làm bài ôn tập" };

export default function QuizAttemptPage({ params }: PageProps<"/hoc-sinh/trac-nghiem/[attemptId]">) {
  return (
    <Suspense fallback={<p className="text-sm opacity-70">Đang tải bài…</p>}>
      <AttemptById params={params} />
    </Suspense>
  );
}

// Đọc params trong <Suspense> (cacheComponents).
async function AttemptById({ params }: Pick<PageProps<"/hoc-sinh/trac-nghiem/[attemptId]">, "params">) {
  const { attemptId } = await params;
  return <QuizRunner attemptId={attemptId} />;
}
