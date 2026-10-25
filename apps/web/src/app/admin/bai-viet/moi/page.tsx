import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/features/posts";

export const metadata: Metadata = { title: "Viết bài mới" };

export default function NewPostPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Viết bài mới</h1>
      {/* Trình soạn thảo dùng giá trị ngẫu nhiên khi dựng, nên phải nằm trong <Suspense>. */}
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <PostEditor />
      </Suspense>
    </div>
  );
}
