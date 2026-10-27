import Link from "next/link";
import { SCHOOL_SHORT_NAME } from "../lib/school-info";
import { LogoPlaceholder } from "./logo-placeholder";

export const PUBLIC_NAV = [
  { href: "/", label: "Trang chủ" },
  { href: "/gioi-thieu", label: "Giới thiệu" },
  { href: "/tin-tuc", label: "Tin tức" },
  { href: "/thong-bao", label: "Thông báo" },
  { href: "/tuyen-sinh", label: "Tuyển sinh" },
  { href: "/lich-su-kien", label: "Lịch sự kiện" },
  { href: "/thu-vien", label: "Thư viện số" },
  { href: "/lien-he", label: "Liên hệ" },
] as const;

const linkClass = "rounded px-3 py-2 text-sm font-medium hover:bg-white/15";

// Thanh điều hướng: dạng hàng ngang từ màn hình vừa trở lên, dạng menu thả (<details>, không cần JS) trên điện thoại.
export function SiteHeader() {
  return (
    <header className="bg-brand text-white">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-3 font-semibold">
          <LogoPlaceholder />
          <span className="leading-tight">
            {SCHOOL_SHORT_NAME}
            <span className="block text-xs font-normal opacity-80">Cổng thông tin điện tử</span>
          </span>
        </Link>

        <nav aria-label="Menu chính" className="ml-auto hidden items-center gap-1 lg:flex">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className={linkClass}>
              {item.label}
            </Link>
          ))}
        </nav>

        <details className="group relative ml-auto lg:hidden">
          <summary className="cursor-pointer list-none rounded border border-white/40 px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">Menu</span>
            <span className="hidden group-open:inline">Đóng</span>
          </summary>
          <nav
            aria-label="Menu chính (điện thoại)"
            className="absolute right-0 z-20 mt-2 flex w-56 flex-col rounded bg-brand p-2 shadow-lg ring-1 ring-white/20"
          >
            {PUBLIC_NAV.map((item) => (
              <Link key={item.href} href={item.href} className={linkClass}>
                {item.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
