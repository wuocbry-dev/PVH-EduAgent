import { PORTAL_INFO, type Portal } from "@pvh/shared";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { LogoPlaceholder } from "@/features/site";
import { Skeleton } from "@/shared/ui";
import { PortalDot } from "./portal-dot";
import { PortalFrame } from "./portal-frame";
import { PortalNav } from "./portal-nav";
import { PortalSwitcher } from "./portal-switcher";
import { UserAvatarLink, UserMenu } from "./user-menu";

// Khung dùng chung của mọi cổng (bước 29): thanh bên dính gồm logo/tên cổng ở trên, menu cuộn riêng ở giữa, tài khoản +
// nút gạt theme + đăng xuất ghim ở đáy. Proxy đã chặn người chưa đăng nhập hoặc sai cổng trước khi tới đây.
export function PortalShell({ portal, children }: { portal: Portal; children: ReactNode }) {
  const info = PORTAL_INFO[portal];

  return (
    <PortalFrame
      portal={portal}
      avatar={
        <Suspense fallback={<span className="size-8 rounded-full bg-primary-soft" aria-hidden />}>
          <UserAvatarLink portal={portal} />
        </Suspense>
      }
      sidebar={
        <>
          <div className="space-y-3 border-b border-border px-4 pt-4 pb-3">
            <Link href="/" className="flex items-center gap-2.5 rounded-xl text-navy focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
              <LogoPlaceholder className="size-9" />
              <span className="text-sm leading-tight font-semibold">
                THPT Phan Văn Hớn
                <span className="block text-xs font-normal text-muted">Cổng nội bộ</span>
              </span>
            </Link>
            <Link href={info.path} className="flex items-center gap-2 rounded-xl font-semibold text-navy focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
              <PortalDot portal={portal} />
              {info.name}
            </Link>
            <Suspense fallback={null}>
              <PortalSwitcher portal={portal} />
            </Suspense>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
            <Suspense fallback={<Skeleton lines={6} className="px-3" />}>
              <PortalNav portal={portal} />
            </Suspense>
          </div>
          <div className="border-t border-border p-3">
            <Suspense fallback={<Skeleton lines={2} />}>
              <UserMenu portal={portal} />
            </Suspense>
          </div>
        </>
      }
    >
      {children}
    </PortalFrame>
  );
}
