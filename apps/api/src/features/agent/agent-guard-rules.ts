// Hàm thuần của bộ giám sát AI Agent (bước 27).

// Mẫu nghi tiêm lệnh (prompt injection) đơn giản theo quy tắc. Chỉ để ĐÁNH DẤU và ĐẾM (báo ADMIN khi lặp lại),
// không bao giờ chặn tin của người dùng: câu bình thường có thể vô tình khớp.
const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget)\b.{0,30}\b(previous|prior|above|all|earlier)\b.{0,20}\b(instructions?|prompts?|rules?)\b/i,
  /(bỏ qua|quên|phớt lờ|lờ đi)\s.{0,30}(chỉ dẫn|hướng dẫn|chỉ thị|quy tắc|lệnh)\s.{0,20}(trước|ở trên|hệ thống|của bạn)/i,
  /\b(system\s*prompt|developer\s*(mode|message)|jailbreak|DAN mode)\b/i,
  /(lời nhắc hệ thống|chế độ nhà phát triển|vượt rào)/i,
  /<\/?\s*(system|assistant|du-lieu|data|instructions?)\s*>/i,
  /\[\[?\s*(system|admin|override)\s*\]?\]/i,
  /\b(you are now|from now on you are|act as (an? )?(admin|administrator|root|system))\b/i,
  /(từ giờ bạn là|bạn bây giờ là|hãy đóng vai (quản trị|admin|hệ thống))/i,
  /\b(reveal|print|show)\b.{0,20}\b(your|the)\b.{0,10}\b(system prompt|instructions|api key|token)\b/i,
  /(tiết lộ|in ra|cho (tôi|mình) xem)\s.{0,20}(lời nhắc hệ thống|khoá api|khóa api|token|mật khẩu)/i,
];

// Số mẫu khớp trong văn bản (0 = bình thường). Chỉ xét 4000 ký tự đầu để không tốn công với tin rất dài.
export function injectionSignals(text: string): number {
  const sample = text.slice(0, 4000);
  return INJECTION_PATTERNS.filter((re) => re.test(sample)).length;
}

// Ngày theo giờ Việt Nam (YYYY-MM-DD): hạn mức theo ngày đặt lại lúc 0 giờ Việt Nam.
export function vnDay(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// Chi phí đếm bằng micro-USD (số nguyên) để cộng dồn trong Redis không lệch số thực.
export const toMicroUsd = (usd: number) => Math.max(0, Math.round(usd * 1_000_000));
// Hiển thị 4 chữ số thập phân (mỗi lệnh thường chỉ vài phần nghìn USD).
export const fromMicroUsd = (micro: number) => Math.round(micro / 100) / 10_000;
