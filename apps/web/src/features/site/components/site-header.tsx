import { LogIn } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles, ThemeToggle } from "@/shared/ui";
import { SCHOOL_SHORT_NAME } from "../lib/school-info";
import { LogoPlaceholder } from "./logo-placeholder";
import { navLinkClass, PUBLIC_NAV } from "./public-nav";
import { HeaderShadow, MobileNav, NavLinks } from "./site-header-client";

export { PUBLIC_NAV };

// Header trang công khai (bước 29): dính trên cùng, nền mờ, có bóng khi đã cuộn (HeaderShadow). Từ xl: menu hàng ngang;
// nhỏ hơn: nút ☰ mở ngăn kéo. Mục đang mở được tô (đọc usePathname nên nằm trong <Suspense>, fallback là menu không tô).
export function SiteHeader() {
  const plain = PUBLIC_NAV.map((item) => (
    <Link key={item.href} href={item.href} className={navLinkClass(false)}>
      {item.label}
    </Link>
  ));

  return (
    <HeaderShadow>
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-2.5">
        <Link href="/" className="flex items-center gap-3 rounded-xl font-semibold text-navy focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          <LogoPlaceholder />
          <span className="leading-tight whitespace-nowrap">
            {SCHOOL_SHORT_NAME}
            <span className="block text-xs font-normal text-muted">Cổng thông tin điện tử</span>
          </span>
        </Link>

        <nav aria-label="Menu chính" className="ml-auto hidden items-center gap-0.5 xl:flex">
          <Suspense fallback={plain}>
            <NavLinks />
          </Suspense>
        </nav>

        <div className="ml-auto flex items-center gap-2 xl:ml-2">
          {/* Điện thoại: nút gạt và Đăng nhập nằm trong ngăn kéo menu. */}
          <div className="hidden items-center gap-2 sm:flex">
            <ThemeToggle compact />
            <Link href="/dang-nhap" className={buttonStyles({ size: "sm", className: "whitespace-nowrap" })}>
              <LogIn className="size-4" aria-hidden />
              Đăng nhập
            </Link>
          </div>
          <MobileNav />
        </div>
      </div>
    </HeaderShadow>
  );
}
