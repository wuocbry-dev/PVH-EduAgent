import type { Metadata } from "next";
import { Suspense } from "react";
import { NewsBrowser } from "@/features/posts";
import { CATEGORY_ANNOUNCEMENTS, Loading, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Thông báo",
  description: "Thông báo dành cho học sinh, phụ huynh và công tác tuyển sinh của Trường THPT Phan Văn Hớn.",
  alternates: { canonical: "/thong-bao" },
};

// F04 – Thông báo: các bài thuộc chuyên mục "thong-bao".
export default function AnnouncementsPage({ searchParams }: PageProps<"/thong-bao">) {
  return (
    <PageShell title="Thông báo" description="Thông báo dành cho học sinh, phụ huynh và tuyển sinh.">
      <Suspense fallback={<Loading text="Đang tải thông báo…" />}>
        <NewsBrowser
          searchParams={searchParams}
          basePath="/thong-bao"
          fixedCategory={CATEGORY_ANNOUNCEMENTS}
          emptyText="Chưa có thông báo nào."
        />
      </Suspense>
    </PageShell>
  );
}
