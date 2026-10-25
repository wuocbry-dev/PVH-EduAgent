import Link from "next/link";
import { formatDate } from "@/shared/lib/format";
import { getPublicPosts } from "../api/public-posts";
import { NewsCard } from "./news-card";

interface Props {
  category: string;
  count: number;
  variant: "cards" | "list";
}

// Các bài mới nhất của một chuyên mục, dùng ở trang chủ (tin nổi bật, thông báo mới).
export async function LatestPosts({ category, count, variant }: Props) {
  const result = await getPublicPosts({ category, page: 1, pageSize: count });

  if (result === null) {
    return <p className="text-sm opacity-70">Không tải được dữ liệu lúc này, vui lòng thử lại sau.</p>;
  }
  if (result.items.length === 0) return <p className="text-sm opacity-70">Chưa có bài viết nào.</p>;

  if (variant === "cards") {
    return (
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {result.items.map((post) => (
          <li key={post.id} className="contents">
            <NewsCard post={post} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="divide-y divide-black/10 dark:divide-white/15">
      {result.items.map((post) => (
        <li key={post.id} className="flex flex-wrap items-baseline justify-between gap-x-4 py-3">
          <Link href={`/tin-tuc/${post.slug}`} className="font-medium hover:underline">
            {post.title}
          </Link>
          <time dateTime={post.publishedAt} className="text-xs opacity-70">
            {formatDate(post.publishedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
