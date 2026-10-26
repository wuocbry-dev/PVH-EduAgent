import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/features/posts";

export const metadata: Metadata = { title: "Bài viết" };

export default function EditPostPage({ params }: PageProps<"/bgh/bai-viet/[id]">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bài viết</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
        <PostById params={params} />
      </Suspense>
    </div>
  );
}

// Đọc params trong <Suspense> (cacheComponents).
async function PostById({ params }: Pick<PageProps<"/bgh/bai-viet/[id]">, "params">) {
  const { id } = await params;
  return <PostEditor postId={id} />;
}
