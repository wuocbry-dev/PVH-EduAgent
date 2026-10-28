"use client";

import { LogIn, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { buttonStyles, cn, ThemeToggle } from "@/shared/ui";
import { isActiveHref, navLinkClass, PUBLIC_NAV } from "./public-nav";

// Vỏ <header> dính: thêm bóng khi trang đã cuộn.
export function HeaderShadow({ children }: { children: ReactNode }) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b bg-background/80 backdrop-blur transition-shadow duration-200 print:static",
        scrolled ? "border-border shadow-(--shadow-card)" : "border-transparent",
      )}
    >
      {children}
    </header>
  );
}

// Menu có tô mục đang mở (đọc usePathname: đặt trong <Suspense>).
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return PUBLIC_NAV.map((item) => {
    const active = isActiveHref(item.href, pathname);
    return (
      <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={navLinkClass(active)} onClick={onNavigate}>
        {item.label}
      </Link>
    );
  });
}

// Ngăn kéo menu cho màn hình nhỏ (< xl) bằng <dialog> gốc mở với showModal(): phần còn lại của trang thành inert,
// Esc đóng. Cũng đóng khi chọn mục hoặc bấm nền; khoá cuộn nền khi mở, đóng xong trả focus về nút ☰.
export function MobileNav() {
  const dialog = useRef<HTMLDialogElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  function open() {
    dialog.current?.showModal();
    document.documentElement.style.overflow = "hidden";
  }
  const close = () => dialog.current?.close();

  return (
    <div className="xl:hidden">
      <button
        ref={toggle}
        type="button"
        aria-label="Mở menu"
        aria-haspopup="dialog"
        aria-controls="menu-dien-thoai"
        onClick={open}
        className="rounded-xl p-2 text-navy hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
      >
        <Menu className="size-5" aria-hidden />
      </button>
      <dialog
        ref={dialog}
        id="menu-dien-thoai"
        aria-modal="true"
        aria-label="Menu chính"
        onClose={() => {
          document.documentElement.style.overflow = "";
          toggle.current?.focus({ preventScroll: true });
        }}
        onClick={(e) => {
          if (e.target === dialog.current) close();
        }}
        className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-none w-72 max-w-[85vw] border-l border-border bg-surface p-0 text-foreground shadow-(--shadow-card) backdrop:bg-overlay"
      >
        <div className="flex h-full flex-col gap-4 p-4">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-navy">Menu</span>
            <button
              type="button"
              aria-label="Đóng menu"
              onClick={close}
              className="rounded-full p-1.5 text-muted hover:bg-primary-soft hover:text-foreground focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
          <nav aria-label="Menu chính (điện thoại)" className="flex flex-col gap-0.5">
            <Suspense
              fallback={PUBLIC_NAV.map((item) => (
                <Link key={item.href} href={item.href} className={navLinkClass(false)} onClick={close}>
                  {item.label}
                </Link>
              ))}
            >
              <NavLinks onNavigate={close} />
            </Suspense>
          </nav>
          <div className="mt-auto space-y-3 border-t border-border pt-4">
            <ThemeToggle className="w-full justify-between" />
            <Link href="/dang-nhap" className={buttonStyles({ full: true })} onClick={close}>
              <LogIn className="size-4" aria-hidden />
              Đăng nhập
            </Link>
          </div>
        </div>
      </dialog>
    </div>
  );
}
