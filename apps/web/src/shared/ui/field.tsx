import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

// Ô nhập, ô chọn, vùng soạn chữ: bo rounded-xl, viền token, vòng focus màu accent. Mặc định rộng hết khung (w-full);
// truyền className để đổi (vd. "w-auto", "w-28").
export const fieldClass = cn(
  "w-full rounded-xl border border-border-strong bg-surface px-3 py-2 text-foreground placeholder:text-muted",
  "transition-colors duration-150 focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:outline-none",
  "disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-danger",
);

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(fieldClass, className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(fieldClass, className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(fieldClass, className)} {...props} />;
}

// Thông báo lỗi của từng ô/form: giữ tại chỗ (không dùng Toast).
export const errorClass = "text-sm text-danger";
