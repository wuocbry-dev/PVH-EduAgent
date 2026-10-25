import type { PublicPostDto } from "@pvh/shared";
import Link from "next/link";
import { formatDate } from "@/shared/lib/format";
import { mediaSrc } from "@/shared/lib/media-url";
import { ViewCounter } from "./view-counter";

// Trang chi tiết bài. Nội dung HTML đã được server lọc XSS khi lưu.
export function PublicPostView({ post }: { post: PublicPostDto }) {
  return (
    <article className="mx-auto max-w-3xl space-y-4">
      <nav aria-label="Đường dẫn" className="text-sm opacity-70">
        <Link href="/tin-tuc" className="hover:underline">
          Tin tức
        </Link>
        {post.categoryName && post.categorySlug && (
          <>
            {" › "}
            <Link href={`/tin-tuc?category=${post.categorySlug}`} className="hover:underline">
              {post.categoryName}
            </Link>
          </>
        )}
      </nav>
      <h1 className="text-3xl font-bold leading-tight text-brand">{post.title}</h1>
      <p className="text-sm opacity-70">
        <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time> · {post.authorName} ·{" "}
        {post.viewCount.toLocaleString("vi-VN")} lượt xem
      </p>
      {post.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaSrc(post.thumbnailUrl)} alt="" className="w-full rounded-lg" />
      )}
      <div className="rich-content leading-relaxed" dangerouslySetInnerHTML={{ __html: post.content }} />
      <ViewCounter slug={post.slug} />
    </article>
  );
}
