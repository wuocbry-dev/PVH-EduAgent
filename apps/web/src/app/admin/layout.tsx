import { PortalShell } from "@/features/auth";

// Proxy (src/proxy.ts) đã chặn người chưa đăng nhập hoặc không thuộc cổng này trước khi tới đây.
export default function Layout({ children }: LayoutProps<"/admin">) {
  return <PortalShell portal="admin">{children}</PortalShell>;
}
