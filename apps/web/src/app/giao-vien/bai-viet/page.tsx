import type { Metadata } from "next";
import { PostManager } from "@/features/posts";

export const metadata: Metadata = { title: "Bài viết" };

export default function PostsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Bài viết của tôi</h1>
      <PostManager />
    </div>
  );
}
