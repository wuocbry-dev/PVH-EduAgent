import { Suspense } from "react";
import { SiteFooter, SiteHeader } from "@/features/site";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <a
        href="#noi-dung"
        className="sr-only focus:not-sr-only focus:absolute focus:z-30 focus:bg-background focus:p-3"
      >
        Bỏ qua điều hướng
      </a>
      <SiteHeader />
      <main id="noi-dung" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {children}
      </main>
      <Suspense fallback={<div className="mt-12 h-40 bg-brand" aria-hidden />}>
        <SiteFooter />
      </Suspense>
    </>
  );
}
