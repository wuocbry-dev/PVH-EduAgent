// Ghép lớp CSS, bỏ giá trị rỗng/false.
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
