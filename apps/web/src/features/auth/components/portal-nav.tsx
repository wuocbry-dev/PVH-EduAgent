import { PORTAL_INFO, type Portal } from "@pvh/shared";
import Link from "next/link";
import { Fragment } from "react";
import { getCurrentUser } from "../api/get-current-user";

// Menu của cổng: chỉ hiện mục mà người dùng có quyền. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
// Mục có `group` (bước 28): hiện tiêu đề nhóm nhỏ mỗi khi nhóm đổi; trên điện thoại tiêu đề chiếm cả dòng để menu xuống hàng gọn.
export async function PortalNav({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  const { path, nav } = PORTAL_INFO[portal];
  const items = nav.filter((item) => !item.permissions || item.permissions.some((p) => user.permissions.includes(p)));
  const size = portal === "hoc-sinh" ? "text-base" : "text-sm";

  return (
    <nav aria-label={`Menu ${PORTAL_INFO[portal].name}`} className="flex flex-wrap gap-x-4 gap-y-2 md:flex-col md:gap-2">
      {items.map((item, i) => {
        const heading = item.group && item.group !== items[i - 1]?.group ? item.group : null;
        return (
          <Fragment key={item.slug}>
            {heading && <p className="mt-1 w-full text-xs font-semibold tracking-wide uppercase opacity-60 md:mt-3">{heading}</p>}
            <Link href={item.slug ? `${path}/${item.slug}` : path} className={size}>
              {item.label}
            </Link>
          </Fragment>
        );
      })}
    </nav>
  );
}
