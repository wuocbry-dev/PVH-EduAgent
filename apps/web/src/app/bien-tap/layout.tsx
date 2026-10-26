import { PortalShell } from "@/features/auth";

// Proxy (src/proxy.ts) đã chặn người chưa đăng nhập hoặc không thuộc cổng này trước khi tới đây.
export default function Layout({ children }: LayoutProps<"/bien-tap">) {
  return <PortalShell portal="bien-tap">{children}</PortalShell>;
}
