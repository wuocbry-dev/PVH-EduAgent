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

// Mục đang mở: trang chủ chỉ khớp "/", các mục khác khớp cả trang con (/tin-tuc/abc).
export const isActiveHref = (href: string, pathname: string): boolean =>
  href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

export const navLinkClass = (active: boolean): string =>
  [
    "rounded-xl px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
    active ? "bg-primary-soft text-primary" : "text-foreground hover:bg-primary-soft/60 hover:text-primary",
  ].join(" ");
