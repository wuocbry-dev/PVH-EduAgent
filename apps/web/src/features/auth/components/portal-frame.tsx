"use client";

import { PORTAL_INFO, sectionOfPath, type Portal } from "@pvh/shared";
import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/shared/ui";

const COMMON_LABELS: Record<string, string> = { "tai-khoan": "Tài khoản", "doi-mat-khau": "Đổi mật khẩu" };

// Tên trang hiện tại cho thanh trên của điện thoại, theo mục menu chứa đường dẫn. Đọc usePathname nên tách riêng, nằm
// trong <Suspense> (cacheComponents: hook này treo ở route có tham số động).
function CurrentPageTitle({ portal }: { portal: Portal }) {
  const section = sectionOfPath(usePathname());
  return <>{PORTAL_INFO[portal].nav.find((n) => n.slug === section)?.label ?? COMMON_LABELS[section] ?? PORTAL_INFO[portal].name}</>;
}

// Khung bố cục của mọi cổng: MỘT thanh bên duy nhất. Màn hình ≥ md: thanh bên dính (h-dvh), chỉ phần nội dung cuộn.
// Điện thoại: thanh trên dính (☰, tên trang, avatar), thanh bên thành ngăn kéo trượt: đóng khi bấm một liên kết, Esc, bấm nền;
// khi mở thì khoá cuộn nền và nội dung phía sau thành inert (focus không ra khỏi ngăn kéo).
export function PortalFrame({
  portal,
  sidebar,
  avatar,
  children,
}: {
  portal: Portal;
  sidebar: ReactNode;
  avatar: ReactNode;
  children: ReactNode;
}) {
  const [isOpen, setOpen] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const opener = toggle.current;
    closeButton.current?.focus();
    document.documentElement.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.documentElement.style.overflow = "";
      document.removeEventListener("keydown", onKey);
      opener?.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return (
    <div className={cn("flex flex-1 flex-col md:flex-row", portal === "hoc-sinh" && "text-lg")}>
      <header
        inert={isOpen}
        className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur md:hidden print:hidden"
      >
        <button
          ref={toggle}
          type="button"
          aria-label="Mở menu"
          aria-expanded={isOpen}
          aria-controls="portal-sidebar"
          onClick={() => setOpen(true)}
          className="rounded-xl p-2 text-navy hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <Menu className="size-5" aria-hidden />
        </button>
        <span className="min-w-0 flex-1 truncate font-semibold text-navy">
          <Suspense fallback={PORTAL_INFO[portal].name}>
            <CurrentPageTitle portal={portal} />
          </Suspense>
        </span>
        {avatar}
      </header>

      {isOpen && <div aria-hidden className="fixed inset-0 z-40 bg-overlay md:hidden" onClick={() => setOpen(false)} />}

      <aside
        id="portal-sidebar"
        aria-label={`Thanh bên ${PORTAL_INFO[portal].name}`}
        // Chọn một mục menu (hay liên kết bất kỳ) trong ngăn kéo thì đóng ngăn kéo.
        onClick={(e) => {
          if (isOpen && (e.target as Element).closest("a")) setOpen(false);
        }}
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-surface duration-200",
          "md:visible md:sticky md:top-0 md:z-auto md:h-dvh md:w-64 md:max-w-none md:translate-x-0 md:shrink-0 print:hidden",
          // Mở: hiện ngay (để focus được nút Đóng); đóng: trượt ra rồi mới ẩn (visibility trễ theo chuyển cảnh).
          isOpen ? "visible translate-x-0 shadow-(--shadow-card) transition-[translate]" : "invisible -translate-x-full transition-[translate,visibility]",
        )}
      >
        <button
          ref={closeButton}
          type="button"
          aria-label="Đóng menu"
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 rounded-full p-1.5 text-muted hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none md:hidden"
        >
          <X className="size-4" aria-hidden />
        </button>
        {sidebar}
      </aside>

      {/* min-w-0: bảng rộng (sổ điểm, thời khoá biểu) cuộn trong khung của nó thay vì đẩy cả trang tràn ngang. */}
      <main inert={isOpen} id="noi-dung" className="min-w-0 flex-1 p-4 md:p-8 print:p-0">
        {children}
      </main>
    </div>
  );
}
