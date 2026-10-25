import type { PublicPostSummaryDto } from "@pvh/shared";
import Link from "next/link";
import { formatDate } from "@/shared/lib/format";
import { mediaSrc } from "@/shared/lib/media-url";

// Thẻ tin: ảnh đại diện (nếu có), chuyên mục, tiêu đề, trích đoạn, ngày đăng.
export function NewsCard({ post }: { post: PublicPostSummaryDto }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-background dark:border-white/15">
      {post.thumbnailUrl ? (
        // Ảnh từ API khác nguồn gốc; không dùng next/image để khỏi phải khai báo remotePatterns.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaSrc(post.thumbnailUrl)} alt="" loading="lazy" className="aspect-video w-full object-cover" />
      ) : (
        <div className="aspect-video w-full bg-brand/10" aria-hidden />
      )}
      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-xs opacity-70">
          {post.categoryName && <span className="mr-2 font-medium text-brand">{post.categoryName}</span>}
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        </p>
        <h3 className="font-semibold leading-snug">
          <Link href={`/tin-tuc/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </h3>
        {post.excerpt && <p className="line-clamp-3 text-sm opacity-80">{post.excerpt}</p>}
      </div>
    </article>
  );
}
