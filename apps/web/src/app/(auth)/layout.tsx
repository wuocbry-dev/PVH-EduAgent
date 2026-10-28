import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { LogoPlaceholder, SCHOOL_SHORT_NAME } from "@/features/site";
import { Card, ThemeToggle } from "@/shared/ui";

// Khung chung của đăng nhập, kích hoạt, quên/đặt lại mật khẩu, đã đăng xuất (bước 29). Màn hình rộng: hai cột (trái là khối
// giới thiệu nền gradient, phải là thẻ form); điện thoại: một cột, logo ở trên. Trang con chỉ vẽ tiêu đề + form, không tự bọc thẻ.
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main id="noi-dung" className="grid flex-1 lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-linear-to-br from-hero-from to-hero-to p-10 text-hero-foreground lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden className="absolute -top-24 -right-24 size-80 rounded-full bg-white/10" />
        <span aria-hidden className="absolute -bottom-32 -left-16 size-96 rounded-full bg-white/5" />
        <Link href="/" className="relative flex items-center gap-3 rounded-xl font-semibold focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none">
          <LogoPlaceholder className="size-12" />
          <span className="text-lg leading-tight">
            {SCHOOL_SHORT_NAME}
            <span className="block text-sm font-normal">Cổng thông tin điện tử</span>
          </span>
        </Link>
        <div className="relative max-w-md space-y-3">
          <p className="text-3xl leading-tight font-bold">Học tập, giảng dạy và quản lý nhà trường ở một nơi.</p>
          <p>Thời khoá biểu, điểm, thông báo, thư viện số và Trợ lý AI cho học sinh, giáo viên và cán bộ nhà trường.</p>
        </div>
        <p className="relative text-sm">Tài khoản do nhà trường cấp. Lần đầu dùng hệ thống, hãy kích hoạt bằng mã trên phiếu tài khoản.</p>
      </section>

      <div className="flex flex-col px-4 py-4 sm:px-8">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-xl text-sm font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
            <ArrowLeft className="size-4" aria-hidden />
            Về trang chủ
          </Link>
          <ThemeToggle compact />
        </div>
        <div className="flex flex-1 flex-col items-center justify-center gap-6 py-8">
          <Link href="/" className="flex items-center gap-3 rounded-xl font-semibold text-navy focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none lg:hidden">
            <LogoPlaceholder />
            <span className="leading-tight">
              {SCHOOL_SHORT_NAME}
              <span className="block text-xs font-normal text-muted">Cổng thông tin điện tử</span>
            </span>
          </Link>
          <Card className="w-full max-w-md space-y-5 p-6 sm:p-8">{children}</Card>
        </div>
      </div>
    </main>
  );
}
