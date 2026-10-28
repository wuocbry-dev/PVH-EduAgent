"use client";

import type { ReactNode } from "react";
import { ConfirmProvider } from "./confirm";
import { ToastProvider } from "./toast";

// Bọc toàn ứng dụng (layout gốc): thông báo ngắn và hộp xác nhận dùng chung.
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>{children}</ConfirmProvider>
    </ToastProvider>
  );
}
