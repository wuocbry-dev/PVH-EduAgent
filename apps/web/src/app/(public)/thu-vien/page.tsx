import type { Metadata } from "next";
import { Suspense } from "react";
import { LibraryBrowser } from "@/features/library";
import { Loading, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Thư viện số",
  description: "Sách, sách nói, video bài giảng và tài liệu ôn tập của Trường THPT Phan Văn Hớn.",
  alternates: { canonical: "/thu-vien" },
};

// Thư viện số (bước 21): danh mục xem công khai; đọc/nghe/xem cần đăng nhập. Thư viện ảnh ở /thu-vien/anh.
export default function LibraryPage({ searchParams }: PageProps<"/thu-vien">) {
  return (
    <PageShell title="Thư viện số" description="Sách, sách nói, video bài giảng và tài liệu ôn tập của nhà trường.">
      {/* searchParams và cookie là dữ liệu theo yêu cầu: đọc trong <Suspense>, phần khung trang vẫn prerender. */}
      <Suspense fallback={<Loading text="Đang tải thư viện…" />}>
        <LibraryBrowser searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}
