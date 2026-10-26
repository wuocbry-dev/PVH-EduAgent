import { PORTAL_INFO, type Portal } from "@pvh/shared";
import Link from "next/link";

// Trang 404 riêng của từng cổng (hiện trong khung của cổng).
export function PortalNotFound({ portal }: { portal: Portal }) {
  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="text-sm opacity-70">Trang bạn mở không có trong cổng {PORTAL_INFO[portal].name}.</p>
      <Link href={PORTAL_INFO[portal].path} className="inline-block underline">
        Về trang chủ của cổng
      </Link>
    </div>
  );
}
