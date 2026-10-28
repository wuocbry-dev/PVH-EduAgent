import { ArrowRight } from "lucide-react";
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
import { buttonStyles } from "@/shared/ui";

function Section({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="text-2xl font-semibold text-navy">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 rounded-xl text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          Xem tất cả
          <ArrowRight className="size-4" aria-hidden />
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
      <section className="relative -mx-4 -mt-8 overflow-hidden bg-linear-to-br from-hero-from to-hero-to px-4 py-12 text-hero-foreground sm:mx-0 sm:mt-0 sm:rounded-2xl sm:px-10 sm:py-16">
        <span aria-hidden className="absolute -top-20 -right-20 size-72 rounded-full bg-white/10" />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center">
          <LogoPlaceholder className="h-20 w-20 text-xs" />
          <div className="space-y-3">
            <p className="text-sm tracking-wide uppercase">Năm học đầu tiên 2026–2027</p>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{SCHOOL_NAME}</h1>
            <p>{DEFAULT_ADDRESS}</p>
            <p className="max-w-2xl">
              Năm đặt nền móng: ổn định chuyên môn, xây dựng nền nếp và văn hóa trường học, từng bước phát triển giáo dục STEM,
              môi trường tiếng Anh và tiếp cận công nghệ.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/tuyen-sinh" className={buttonStyles({ variant: "secondary", className: "border-transparent" })}>
                Thông tin tuyển sinh
              </Link>
              <Link href="/gioi-thieu" className="inline-flex items-center rounded-xl border border-current/60 px-4 py-2 text-sm font-medium hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
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
