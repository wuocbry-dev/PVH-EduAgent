import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getPublicPost, PublicPostView } from "@/features/posts";
import { Loading, SCHOOL_NAME } from "@/features/site";
import { mediaSrc } from "@/shared/lib/media-url";

// SEO cho từng bài: tiêu đề, mô tả, Open Graph (ảnh đại diện nếu có). Bài không tồn tại/chưa đăng thì không cho lập chỉ mục.
export async function generateMetadata({ params }: PageProps<"/tin-tuc/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { post, notFound: missing } = await getPublicPost(slug);
  // Gọi notFound() ở đây (trước khi stream nội dung) để phản hồi có mã HTTP 404 thật.
  if (missing) notFound();
  if (!post) return { title: "Không tải được bài viết", robots: { index: false, follow: false } };

  const url = `/tin-tuc/${post.slug}`;
  const images = post.thumbnailUrl ? [mediaSrc(post.thumbnailUrl)] : undefined;
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      locale: "vi_VN",
      siteName: SCHOOL_NAME,
      url,
      title: post.title,
      description: post.excerpt,
      publishedTime: post.publishedAt,
      images,
    },
    twitter: { card: images ? "summary_large_image" : "summary", title: post.title, description: post.excerpt, images },
  };
}

export default function PostPage({ params }: PageProps<"/tin-tuc/[slug]">) {
  return (
    <Suspense fallback={<Loading text="Đang tải bài viết…" />}>
      <PostBySlug params={params} />
    </Suspense>
  );
}

// Đọc params trong <Suspense> (cacheComponents). Bài chưa/không còn PUBLISHED → trang 404.
async function PostBySlug({ params }: Pick<PageProps<"/tin-tuc/[slug]">, "params">) {
  const { slug } = await params;
  const { post, notFound: missing } = await getPublicPost(slug);
  if (missing) notFound();
  if (!post) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        Không tải được bài viết lúc này, vui lòng thử lại sau.
      </p>
    );
  }
  return <PublicPostView post={post} />;
}
