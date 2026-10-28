import { Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { getSiteSettings } from "../api/get-site-settings";
import { DEFAULT_ADDRESS, PENDING, SCHOOL_NAME } from "../lib/school-info";
import { PUBLIC_NAV } from "./public-nav";

// Đọc cấu hình công khai (có cache) nên đặt trong <Suspense>. Nền navy, chữ sáng (đạt AA ở cả hai chế độ).
export async function SiteFooter() {
  const settings = await getSiteSettings();
  const name = settings["school.name"] ?? SCHOOL_NAME;
  const address = settings["school.address"] ?? DEFAULT_ADDRESS;

  return (
    <footer className="mt-12 bg-navy text-navy-foreground">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <p className="font-semibold">{name}</p>
          <p className="flex gap-2">
            <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
            {address}
          </p>
          <p className="flex gap-2">
            <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
            Điện thoại: {settings["school.phone"] ?? PENDING}
          </p>
          <p className="flex gap-2">
            <Mail className="mt-0.5 size-4 shrink-0" aria-hidden />
            Email: {settings["school.email"] ?? PENDING}
          </p>
        </div>
        <nav aria-label="Liên kết nhanh" className="grid grid-cols-2 gap-1">
          {PUBLIC_NAV.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-xl hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
              {item.label}
            </Link>
          ))}
        </nav>
        <p className="sm:col-span-2 lg:col-span-1">
          Trang web đang được xây dựng cùng nhà trường; một số thông tin sẽ được cập nhật khi có công bố chính thức.
        </p>
      </div>
      <div className="border-t border-current/20 py-3 text-center text-xs">© {name}</div>
    </footer>
  );
}
