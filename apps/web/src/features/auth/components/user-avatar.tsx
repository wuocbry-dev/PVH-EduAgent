import { cn } from "@/shared/ui";

// Chữ cái đầu của họ và tên gọi (tên gọi tiếng Việt ở cuối): "Nguyễn Văn An" → "NA"; một chữ: "An" → "A".
export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const last = words[words.length - 1]!;
  return (words.length > 1 ? words[0]![0]! + last[0]! : last[0]!).toUpperCase();
}

// Avatar không cần ảnh: chữ cái đầu trong vòng tròn màu primary-soft.
export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-primary-soft-border bg-primary-soft text-sm font-semibold text-primary",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
