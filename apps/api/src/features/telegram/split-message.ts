// Telegram giới hạn mỗi tin nhắn 4096 ký tự.
export const TELEGRAM_MAX_LENGTH = 4096;

// Chia tin dài thành nhiều phần ≤ max, ưu tiên cắt ở xuống dòng rồi tới khoảng trắng.
// Đếm theo code point để không cắt đôi emoji / ký tự ngoài BMP.
export function splitMessage(text: string, max = TELEGRAM_MAX_LENGTH): string[] {
  const chars = Array.from(text.trim());
  if (chars.length === 0) return [];
  const parts: string[] = [];
  let start = 0;
  while (chars.length - start > max) {
    const window = chars.slice(start, start + max);
    let cut = window.lastIndexOf('\n');
    if (cut < max / 2) cut = window.lastIndexOf(' ');
    if (cut < max / 2) cut = max;
    const part = window.slice(0, cut).join('').trimEnd();
    if (part) parts.push(part);
    start += cut;
    // Bỏ khoảng trắng / xuống dòng ở đầu phần kế tiếp.
    while (start < chars.length && /\s/.test(chars[start])) start++;
  }
  const rest = chars.slice(start).join('').trim();
  if (rest) parts.push(rest);
  return parts;
}
