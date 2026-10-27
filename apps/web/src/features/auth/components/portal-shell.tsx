import { PORTAL_INFO, type Portal } from "@pvh/shared";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { PortalNav } from "./portal-nav";
import { PortalSwitcher } from "./portal-switcher";
import { UserMenu } from "./user-menu";

// Màu nhấn riêng của từng cổng (viết đủ lớp để Tailwind nhận ra).
const ACCENT: Record<Portal, { bar: string; title: string }> = {
  admin: { bar: "border-t-red-600", title: "text-red-700 dark:text-red-400" },
  bgh: { bar: "border-t-indigo-600", title: "text-indigo-700 dark:text-indigo-400" },
  "bien-tap": { bar: "border-t-emerald-600", title: "text-emerald-700 dark:text-emerald-400" },
  "thu-thu": { bar: "border-t-teal-600", title: "text-teal-700 dark:text-teal-400" },
  "giao-vien": { bar: "border-t-amber-500", title: "text-amber-700 dark:text-amber-400" },
  "hoc-sinh": { bar: "border-t-sky-500", title: "text-sky-700 dark:text-sky-400" },
};

// Khung dùng chung của mọi cổng: thanh bên (tên cổng, đổi cổng, menu, tài khoản) và nội dung. Proxy đã chặn người
// chưa đăng nhập hoặc sai cổng trước khi tới đây.
export function PortalShell({ portal, children }: { portal: Portal; children: ReactNode }) {
  const info = PORTAL_INFO[portal];
  const accent = ACCENT[portal];

  return (
    <div className={`flex flex-1 flex-col border-t-4 md:flex-row ${accent.bar} ${portal === "hoc-sinh" ? "text-lg" : ""}`}>
      <aside className="flex flex-col gap-4 border-b border-black/10 p-4 md:w-56 md:border-r md:border-b-0 print:hidden dark:border-white/15">
        <div className="space-y-1">
          <Link href="/" className="block text-xs opacity-60">
            THPT Phan Văn Hớn
          </Link>
          <Link href={info.path} className={`block font-semibold ${accent.title}`}>
            {info.name}
          </Link>
        </div>
        <Suspense fallback={null}>
          <PortalSwitcher portal={portal} />
        </Suspense>
        <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
          <PortalNav portal={portal} />
        </Suspense>
        <div className="border-t border-black/10 pt-4 md:mt-auto dark:border-white/15">
          <Suspense fallback={<p className="text-sm opacity-60">Đang tải…</p>}>
            <UserMenu portal={portal} />
          </Suspense>
        </div>
      </aside>
      {/* min-w-0: bảng rộng (sổ điểm, thời khoá biểu) cuộn trong khung của nó thay vì đẩy cả trang tràn ngang. */}
      <main className="min-w-0 flex-1 p-4 md:p-8 print:p-0">{children}</main>
    </div>
  );
}
