import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/features/site";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#noi-dung"
        className="sr-only z-50 rounded-xl bg-surface p-3 text-primary focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:ring-2 focus:ring-accent"
      >
        Bỏ qua điều hướng
      </a>
      <SiteHeader />
      <main id="noi-dung" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 focus:outline-none">
        {children}
      </main>
      <Suspense fallback={<div className="mt-12 h-40 bg-navy" aria-hidden />}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
