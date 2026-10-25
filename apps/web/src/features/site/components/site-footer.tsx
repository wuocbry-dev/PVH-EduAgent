import Link from "next/link";
import { getSiteSettings } from "../api/get-site-settings";
import { DEFAULT_ADDRESS, PENDING, SCHOOL_NAME } from "../lib/school-info";
import { PUBLIC_NAV } from "./site-header";

// Đọc cấu hình công khai (có cache) nên đặt trong <Suspense>.
export async function SiteFooter() {
  const settings = await getSiteSettings();
  const name = settings["school.name"] ?? SCHOOL_NAME;
  const address = settings["school.address"] ?? DEFAULT_ADDRESS;

  return (
    <footer className="mt-12 bg-brand text-white">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <p className="font-semibold">{name}</p>
          <p className="opacity-90">{address}</p>
          <p className="opacity-90">Điện thoại: {settings["school.phone"] ?? PENDING}</p>
          <p className="opacity-90">Email: {settings["school.email"] ?? PENDING}</p>
        </div>
        <nav aria-label="Liên kết nhanh" className="grid grid-cols-2 gap-1">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="opacity-80 sm:col-span-2 lg:col-span-1">
          Trang web đang được xây dựng cùng nhà trường; một số thông tin sẽ được cập nhật khi có công bố chính thức.
        </p>
      </div>
      <div className="border-t border-white/20 py-3 text-center text-xs opacity-80">
        © {name}
      </div>
    </footer>
  );
}
