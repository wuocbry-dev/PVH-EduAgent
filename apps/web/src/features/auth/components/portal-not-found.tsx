import { PORTAL_INFO, type Portal } from "@pvh/shared";
import Link from "next/link";
import { buttonStyles } from "@/shared/ui";

// Trang 404 riêng của từng cổng (hiện trong khung của cổng).
export function PortalNotFound({ portal }: { portal: Portal }) {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-5xl font-bold text-accent">404</p>
      <h1 className="text-2xl font-bold">Không tìm thấy trang</h1>
      <p className="text-sm text-muted">Trang bạn mở không có trong cổng {PORTAL_INFO[portal].name}.</p>
      <Link href={PORTAL_INFO[portal].path} className={buttonStyles({ variant: "secondary" })}>
        Về trang chủ của cổng
      </Link>
    </div>
  );
}
