"use client";

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";
import { applyTheme, readThemeChoice, saveThemeChoice, THEME_EVENT, type ThemeChoice } from "./theme";
import { cn } from "./cn";

const OPTIONS: { value: ThemeChoice; label: string; Icon: LucideIcon }[] = [
  { value: "light", label: "Sáng", Icon: Sun },
  { value: "dark", label: "Tối", Icon: Moon },
  { value: "system", label: "Theo máy", Icon: Monitor },
];

// Nút gạt Sáng / Tối / Theo máy. `compact`: chỉ icon (thanh hẹp), nhãn vẫn có cho trình đọc màn hình.
export function ThemeToggle({ compact = false, className }: { compact?: boolean; className?: string }) {
  // Máy chủ không biết lựa chọn: vẽ "Theo máy" rồi đọc lại ngay trước khi vẽ (useLayoutEffect) để khỏi lệch hydrate.
  const [choice, setChoice] = useState<ThemeChoice>("system");

  useLayoutEffect(() => {
    const saved = readThemeChoice();
    // Ở chế độ dev, React dựng lại <html> nên mất data-theme do script đặt: đặt lại (bản build thì không đổi gì).
    applyTheme(saved);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- đồng bộ một lần với localStorage sau hydrate
    setChoice(saved);
    const onChange = (e: Event) => setChoice((e as CustomEvent<ThemeChoice>).detail);
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  // Theo máy: đổi theo hệ điều hành ngay khi người dùng đổi chế độ máy.
  useEffect(() => {
    if (choice !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [choice]);

  return (
    <div role="group" aria-label="Giao diện sáng/tối" className={cn("inline-flex rounded-full border border-border bg-surface p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = choice === value;
        return (
          <button
            key={value}
            type="button"
            aria-pressed={active}
            aria-label={compact ? label : undefined}
            title={label}
            onClick={() => saveThemeChoice(value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
              active ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
