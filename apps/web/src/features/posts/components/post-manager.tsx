"use client";

import { POST_STATUS_NAMES, POST_STATUSES, type PostDto, type PostStatus } from "@pvh/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePortalBase } from "@/shared/lib/use-portal-base";
import { CategorySelect } from "@/features/categories";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { listManagePosts } from "../api/posts-api";
import { PostStatusBadge } from "./post-status-badge";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const formatDate = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Danh sách bài viết trong CMS, lọc theo trạng thái và chuyên mục.
export function PostManager() {
  const base = usePortalBase();
  const [status, setStatus] = useState<PostStatus | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [posts, setPosts] = useState<PostDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    listManagePosts({ status, categoryId })
      .then((data) => {
        if (!current) return;
        setPosts(data);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [status, categoryId]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PostStatus | "")}
            className={`${inputClass} w-auto`}
          >
            <option value="">Mọi trạng thái</option>
            {POST_STATUSES.map((s) => (
              <option key={s} value={s}>
                {POST_STATUS_NAMES[s]}
              </option>
            ))}
          </select>
          <CategorySelect value={categoryId} onChange={setCategoryId} emptyLabel="Mọi chuyên mục" />
        </div>
        <Link href={`${base}/bai-viet/moi`} className="rounded bg-foreground px-4 py-2 text-background">
          Viết bài mới
        </Link>
      </div>

      {error && <p className={errorClass}>{error}</p>}
      {posts === null && !error && <p className="text-sm opacity-60">Đang tải…</p>}

      {posts && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15">
              <tr>
                <th className="py-2 pr-4">Tiêu đề</th>
                <th className="py-2 pr-4">Tác giả</th>
                <th className="py-2 pr-4">Chuyên mục</th>
                <th className="py-2 pr-4">Trạng thái</th>
                <th className="py-2">Thời điểm đăng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/15">
              {posts.map((post) => (
                <tr key={post.id}>
                  <td className="py-2 pr-4">
                    <Link href={`${base}/bai-viet/${post.id}`} className="underline">
                      {post.title}
                    </Link>
                    {post.source === "TELEGRAM" && (
                      <span className="ml-2 rounded bg-sky-200 px-1.5 py-0.5 text-xs text-sky-900">Tạo qua Telegram</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">{post.authorName}</td>
                  <td className="py-2 pr-4">{post.categoryName ?? "—"}</td>
                  <td className="py-2 pr-4">
                    <PostStatusBadge status={post.status} />
                  </td>
                  <td className="py-2">
                    {post.publishedAt
                      ? formatDate(post.publishedAt)
                      : post.publishAt
                        ? `Hẹn ${formatDate(post.publishAt)}`
                        : "—"}
                  </td>
                </tr>
              ))}
              {posts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 opacity-70">
                    Không có bài viết phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
