import type { Metadata } from "next";
import { AuthHeading, LoggedOutActions } from "@/features/auth";

// Trang công khai sau khi đăng xuất (bước 29): không nằm trong matcher của proxy, robots chặn, không có trong sitemap.
export const metadata: Metadata = { title: "Đã đăng xuất", robots: { index: false, follow: false } };

export default function LoggedOutPage() {
  return (
    <>
      <AuthHeading title="Bạn đã đăng xuất">Phiên làm việc đã kết thúc trên thiết bị này. Hẹn gặp lại!</AuthHeading>
      <LoggedOutActions />
    </>
  );
}
