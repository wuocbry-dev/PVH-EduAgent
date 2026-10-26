import Link from "next/link";
import { Suspense } from "react";
import { AdminNav, UserMenu } from "@/features/auth";

// Mọi trang /admin đã được src/proxy.ts chặn khi chưa đăng nhập.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="flex flex-col gap-4 print:hidden border-b border-black/10 p-4 md:w-56 md:border-r md:border-b-0 dark:border-white/15">
        <Link href="/" className="font-semibold">
          CMS · PVH
        </Link>
        <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
          <AdminNav />
        </Suspense>
        <div className="border-t border-black/10 pt-4 md:mt-auto dark:border-white/15">
          <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
            <UserMenu />
          </Suspense>
        </div>
      </aside>
      <main className="flex-1 p-4 md:p-8 print:p-0">{children}</main>
    </div>
  );
}
