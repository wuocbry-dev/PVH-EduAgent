"use client";

import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";

type ToastTone = "success" | "error" | "info";
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = 5000;

const STYLE: Record<ToastTone, { className: string; Icon: typeof Info }> = {
  success: { className: "border-success/30 bg-success-soft text-success", Icon: CircleCheck },
  error: { className: "border-danger/30 bg-danger-soft text-danger", Icon: CircleAlert },
  info: { className: "border-primary-soft-border bg-primary-soft text-primary", Icon: Info },
};

// Thông báo ngắn sau thao tác (lưu, xoá, gửi…). Lỗi của từng ô form vẫn hiện tại chỗ, không đưa vào đây.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone: ToastTone, message: string) => {
      const id = nextId.current++;
      setItems((list) => [...list.slice(-3), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push("success", m), error: (m) => push("error", m), info: (m) => push("info", m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Vùng aria-live luôn có mặt để trình đọc màn hình đọc thông báo mới. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:left-auto print:hidden">
        {items.map(({ id, tone, message }) => {
          const { className, Icon } = STYLE[tone];
          return (
            <div
              key={id}
              role={tone === "error" ? "alert" : "status"}
              className={cn("pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-2xl border px-4 py-3 text-sm shadow-(--shadow-card)", className)}
            >
              <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
              <p className="flex-1 break-words">{message}</p>
              <button
                type="button"
                onClick={() => dismiss(id)}
                aria-label="Đóng thông báo"
                className="rounded-full p-0.5 hover:bg-current/10 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast cần nằm trong <AppProviders>");
  return toast;
}
