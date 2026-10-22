import type { Metadata } from "next";
import { Suspense } from "react";
import { PostList } from "@/features/posts";

export const metadata: Metadata = { title: "Tin tức" };

export default function NewsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tin tức – sự kiện</h1>
      <Suspense fallback={<p className="text-sm opacity-60">Đang tải tin…</p>}>
        <PostList />
      </Suspense>
    </div>
  );
}
