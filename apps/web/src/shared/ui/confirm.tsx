"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button } from "./button";
import { Dialog } from "./dialog";

export interface ConfirmOptions {
  title: string;
  // Câu giải thích dưới tiêu đề (giữ nguyên chữ nghiệp vụ cũ của hộp window.confirm()).
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // danger: thao tác xoá/khoá/không hoàn tác được; nút xác nhận màu đỏ, focus mặc định ở nút Huỷ.
  tone?: "primary" | "danger";
}

type Confirm = (options: ConfirmOptions | string) => Promise<boolean>;

// Câu hỏi dạng chuỗi (chữ cũ của window.confirm): tách "Câu hỏi? Giải thích…" hoặc "…\n\n…" thành tiêu đề + lời giải thích;
// câu bắt đầu bằng động từ xoá/khoá/huỷ/gỡ/bỏ thì dùng tông đỏ.
const DANGER = /^(Xóa|Xoá|Khóa|Khoá|Huỷ|Hủy|Gỡ|Bỏ|Mở khoá|TẮT)/;
function fromString(text: string): ConfirmOptions {
  const [head = "", ...rest] = text.split("\n\n");
  const split = rest.length ? null : /^(.+?\?)\s+(\S[\s\S]*)$/.exec(head);
  const title = split ? split[1]! : head;
  const message = split ? split[2] : rest.join("\n\n") || undefined;
  return { title, message, tone: DANGER.test(title) ? "danger" : "primary" };
}

const ConfirmContext = createContext<Confirm | null>(null);

// Thay window.confirm(): `const ask = useConfirm(); if (!(await ask("Xoá …?"))) return;`. Một hộp tại một thời điểm.
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback<Confirm>((input) => {
    resolver.current?.(false);
    setOptions(typeof input === "string" ? fromString(input) : input);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function settle(ok: boolean) {
    resolver.current?.(ok);
    resolver.current = null;
    setOptions(null);
  }

  const danger = options?.tone === "danger";
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => settle(false)}
        title={options?.title ?? ""}
        description={options?.message}
        footer={
          <>
            <Button variant="secondary" onClick={() => settle(false)} data-autofocus={danger || undefined}>
              {options?.cancelLabel ?? "Huỷ"}
            </Button>
            <Button variant={danger ? "danger" : "primary"} onClick={() => settle(true)} data-autofocus={!danger || undefined}>
              {options?.confirmLabel ?? "Đồng ý"}
            </Button>
          </>
        }
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm cần nằm trong <AppProviders>");
  return confirm;
}
