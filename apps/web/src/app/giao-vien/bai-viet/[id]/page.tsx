import type { Metadata } from "next";
import { Suspense } from "react";
import { PostEditor } from "@/features/posts";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Bài viết" };

export default function EditPostPage({ params }: PageProps<"/giao-vien/bai-viet/[id]">) {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bài viết</h1>
      <Suspense fallback={<Skeleton />}>
        <PostById params={params} />
      </Suspense>
    </div>
  );
}

// Đọc params trong <Suspense> (cacheComponents).
async function PostById({ params }: Pick<PageProps<"/giao-vien/bai-viet/[id]">, "params">) {
  const { id } = await params;
  return <PostEditor postId={id} />;
}
