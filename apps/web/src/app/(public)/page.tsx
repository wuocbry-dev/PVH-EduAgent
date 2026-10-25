import Link from "next/link";
import { Suspense } from "react";
import { LatestPosts } from "@/features/posts";
import {
  CATEGORY_ANNOUNCEMENTS,
  CATEGORY_NEWS,
  DEFAULT_ADDRESS,
  Loading,
  LogoPlaceholder,
  SCHOOL_NAME,
} from "@/features/site";

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold text-brand">{title}</h2>
        <Link href={href} className="text-sm underline">
          Xem tất cả
        </Link>
      </div>
      {children}
    </section>
  );
}

// F01 – Trang chủ: banner, tin nổi bật, thông báo mới.
export default function HomePage() {
  return (
    <div className="space-y-12">
      <section className="-mx-4 -mt-8 bg-brand px-4 py-12 text-white sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-10 sm:py-16">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <LogoPlaceholder className="h-20 w-20 text-xs" />
          <div className="space-y-3">
            <p className="text-sm uppercase tracking-wide opacity-80">Năm học đầu tiên 2026–2027</p>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{SCHOOL_NAME}</h1>
            <p className="opacity-90">{DEFAULT_ADDRESS}</p>
            <p className="max-w-2xl opacity-90">
              Năm đặt nền móng: ổn định chuyên môn, xây dựng nền nếp và văn hóa trường học, từng bước phát triển giáo dục STEM,
              môi trường tiếng Anh và tiếp cận công nghệ.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/tuyen-sinh" className="rounded bg-white px-4 py-2 text-sm font-semibold text-[#1d4f91]">
                Thông tin tuyển sinh
              </Link>
              <Link href="/gioi-thieu" className="rounded border border-white/60 px-4 py-2 text-sm font-semibold">
                Giới thiệu trường
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Section title="Tin nổi bật" href="/tin-tuc">
        <Suspense fallback={<Loading text="Đang tải tin…" />}>
          <LatestPosts category={CATEGORY_NEWS} count={3} variant="cards" />
        </Suspense>
      </Section>

      <Section title="Thông báo mới" href="/thong-bao">
        <Suspense fallback={<Loading text="Đang tải thông báo…" />}>
          <LatestPosts category={CATEGORY_ANNOUNCEMENTS} count={5} variant="list" />
        </Suspense>
      </Section>
    </div>
  );
}
