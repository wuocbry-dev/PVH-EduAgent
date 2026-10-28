"use client";

import { sectionOfPath, type PortalNavItem } from "@pvh/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { cn } from "@/shared/ui";
import { navIcon } from "./nav-icons";

// Danh sách mục menu đã lọc theo quyền (PortalNav ở server). Mục đang chọn: nền primary-soft + vạch trái, aria-current.
// Mục có `group` (bước 28): tiêu đề nhóm nhỏ mỗi khi nhóm đổi.
export function PortalNavLinks({ path, items, large }: { path: string; items: readonly PortalNavItem[]; large: boolean }) {
  const section = sectionOfPath(usePathname());

  return (
    <ul className="space-y-0.5">
      {items.map((item, i) => {
        const heading = item.group && item.group !== items[i - 1]?.group ? item.group : null;
        const active = item.slug === section;
        const Icon = navIcon(item.slug);
        return (
          <Fragment key={item.slug}>
            {heading && (
              <li aria-hidden className="px-3 pt-4 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                {heading}
              </li>
            )}
            <li>
              <Link
                href={item.slug ? `${path}/${item.slug}` : path}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-xl px-3 py-2 font-medium transition-colors duration-150",
                  "focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                  large ? "text-base" : "text-sm",
                  active
                    ? "bg-primary-soft text-primary before:absolute before:inset-y-1.5 before:left-0 before:w-1 before:rounded-full before:bg-accent"
                    : "text-foreground hover:bg-primary-soft/60",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {item.label}
              </Link>
            </li>
          </Fragment>
        );
      })}
    </ul>
  );
}
