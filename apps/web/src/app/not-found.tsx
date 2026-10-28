import { House } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/features/site";
import { buttonStyles } from "@/shared/ui";

export const metadata: Metadata = { title: "Không tìm thấy trang", robots: { index: false, follow: false } };

// 404 chung của website (các cổng có not-found riêng trong khung cổng). Cùng khung với trang công khai.
export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main id="noi-dung" className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <p className="text-6xl font-bold text-accent">404</p>
        <h1 className="text-2xl font-bold text-navy">Không tìm thấy trang</h1>
        <p className="max-w-md text-muted">Trang bạn mở không tồn tại hoặc đã được chuyển đi.</p>
        <Link href="/" className={buttonStyles()}>
          <House className="size-4" aria-hidden />
          Về trang chủ
        </Link>
      </main>
      <Suspense fallback={<div className="mt-12 h-40 bg-navy" aria-hidden />}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
