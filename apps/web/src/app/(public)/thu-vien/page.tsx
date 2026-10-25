import type { Metadata } from "next";
import { Suspense } from "react";
import { GalleryGrid } from "@/features/gallery";
import { Loading, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Thư viện ảnh",
  description: "Hình ảnh hoạt động của Trường THPT Phan Văn Hớn.",
  alternates: { canonical: "/thu-vien" },
};

// F06 – Thư viện: ảnh trong các bài đã đăng.
export default function GalleryPage() {
  return (
    <PageShell title="Thư viện ảnh" description="Hình ảnh từ các bài viết và hoạt động của nhà trường.">
      <Suspense fallback={<Loading text="Đang tải ảnh…" />}>
        <GalleryGrid />
      </Suspense>
    </PageShell>
  );
}
