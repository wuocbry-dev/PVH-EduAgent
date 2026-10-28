import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { env } from "@/shared/config/env";
import { AppProviders } from "@/shared/ui/providers";
import { THEME_INIT_SCRIPT } from "@/shared/ui/theme";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  variable: "--font-be-vietnam-pro",
  subsets: ["vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(env.siteUrl),
  title: {
    default: "Trường THPT Phan Văn Hớn",
    template: "%s | THPT Phan Văn Hớn",
  },
  description: "Cổng thông tin điện tử Trường THPT Phan Văn Hớn, phường Đông Hưng Thuận, TP.HCM",
  openGraph: {
    type: "website",
    locale: "vi_VN",
    siteName: "Trường THPT Phan Văn Hớn",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  // Bước 29: script đặt data-theme trước khi vẽ (không chớp trắng). suppressHydrationWarning trên <html> vì script đổi thuộc
  // tính trước khi React hydrate; không đọc cookie ở đây để trang công khai giữ được cache.
  return (
    <html lang="vi" className={`${beVietnamPro.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col" suppressHydrationWarning>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
