import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsBrowser } from "@/features/posts";
import { Loading, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Tin tức – sự kiện",
  description: "Tin tức và sự kiện mới nhất của Trường THPT Phan Văn Hớn.",
  alternates: { canonical: "/tin-tuc" },
};

export default function NewsPage({ searchParams }: PageProps<"/tin-tuc">) {
  return (
    <PageShell title="Tin tức – sự kiện">
      {/* searchParams là dữ liệu theo yêu cầu: đọc trong <Suspense>, phần khung trang vẫn prerender. */}
      <Suspense fallback={<Loading text="Đang tải tin…" />}>
        <NewsBrowser searchParams={searchParams} basePath="/tin-tuc" />
      </Suspense>
    </PageShell>
  );
}
