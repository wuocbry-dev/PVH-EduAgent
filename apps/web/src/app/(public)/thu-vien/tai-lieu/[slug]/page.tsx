import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getLibraryItem, getPublicLibraryItem, LibraryItemView } from "@/features/library";
import { Loading } from "@/features/site";
import { mediaSrc } from "@/shared/lib/media-url";

// SEO chỉ từ dữ liệu công khai (tài liệu toàn trường); tài liệu theo khối/lớp/nhân sự không lập chỉ mục.
export async function generateMetadata({ params }: PageProps<"/thu-vien/tai-lieu/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const { item } = await getPublicLibraryItem(slug);
  if (!item) return { title: "Tài liệu", robots: { index: false, follow: false } };
  const images = item.coverUrl ? [mediaSrc(item.coverUrl)] : undefined;
  return {
    title: item.title,
    description: item.description?.slice(0, 200) ?? `${item.title} – thư viện số Trường THPT Phan Văn Hớn`,
    alternates: { canonical: `/thu-vien/tai-lieu/${item.slug}` },
    openGraph: { type: "book", locale: "vi_VN", title: item.title, images },
  };
}

export default function LibraryItemPage({ params }: PageProps<"/thu-vien/tai-lieu/[slug]">) {
  return (
    <Suspense fallback={<Loading text="Đang tải tài liệu…" />}>
      <ItemBySlug params={params} />
    </Suspense>
  );
}

// Đọc params và cookie trong <Suspense>. Không có hoặc không thuộc đối tượng của người xem → 404.
async function ItemBySlug({ params }: Pick<PageProps<"/thu-vien/tai-lieu/[slug]">, "params">) {
  const { slug } = await params;
  const { item, notFound: missing } = await getLibraryItem(slug);
  if (missing) notFound();
  if (!item) {
    return (
      <p className="rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm text-warning">
        Không tải được tài liệu lúc này, vui lòng thử lại sau.
      </p>
    );
  }
  return <LibraryItemView item={item} />;
}
