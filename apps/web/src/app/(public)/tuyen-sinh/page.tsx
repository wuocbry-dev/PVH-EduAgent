import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdmissionTable } from "@/features/admission";
import { LatestPosts } from "@/features/posts";
import { CATEGORY_ADMISSION, Loading, PageShell, SCHOOL_FACTS } from "@/features/site";

export const metadata: Metadata = {
  title: "Tuyển sinh lớp 10",
  description: "Chỉ tiêu, điểm chuẩn và thông tin tuyển sinh lớp 10 Trường THPT Phan Văn Hớn.",
  alternates: { canonical: "/tuyen-sinh" },
};

// F05 – Tuyển sinh: chỉ tiêu và điểm chuẩn từ bảng admission_stats, cùng tin tuyển sinh.
export default function AdmissionPage() {
  const highlights = SCHOOL_FACTS.filter((f) => f.label.startsWith("Chỉ tiêu") || f.label.startsWith("Điểm chuẩn"));
  return (
    <PageShell title="Tuyển sinh lớp 10" description="Thông tin tuyển sinh Trường THPT Phan Văn Hớn.">
      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-navy">Chỉ tiêu và điểm chuẩn</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {highlights.map((f) => (
            <li key={f.label} className="rounded-2xl bg-surface border border-border p-4">
              <p className="text-sm text-muted">{f.label}</p>
              <p className="text-lg font-semibold">{f.value}</p>
            </li>
          ))}
        </ul>
        <Suspense fallback={<Loading />}>
          <AdmissionTable />
        </Suspense>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-navy">Hồ sơ tuyển sinh</h2>
        <p className="opacity-90">
          Thí sinh đăng ký và nộp hồ sơ theo hướng dẫn chung của Sở Giáo dục và Đào tạo TP.HCM. Danh mục hồ sơ và lịch nhập học
          của trường sẽ được đăng ở mục Thông báo ngay khi có công bố; mọi thắc mắc xin gửi qua trang{" "}
          <Link href="/lien-he" className="text-navy underline">
            Liên hệ
          </Link>
          .
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-navy">Tin tuyển sinh mới</h2>
        <Suspense fallback={<Loading />}>
          <LatestPosts category={CATEGORY_ADMISSION} count={5} variant="list" />
        </Suspense>
      </section>
    </PageShell>
  );
}
