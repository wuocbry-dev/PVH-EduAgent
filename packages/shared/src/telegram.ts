// A01 – liên kết tài khoản với Telegram.

// GET /api/telegram/link
export interface TelegramLinkStatusDto {
  // Bot đã cấu hình (có TELEGRAM_BOT_TOKEN) hay chưa.
  enabled: boolean;
  linked: boolean;
  // @username của bot (không có dấu @), null nếu chưa đọc được từ Telegram.
  botUsername: string | null;
}

// POST /api/telegram/link-code
export interface TelegramLinkCodeDto {
  // OTP 6 số, chỉ trả về đúng một lần; máy chủ chỉ lưu bản băm.
  code: string;
  expiresAt: string;
  // https://t.me/<bot>?start=<code>, null nếu chưa biết username của bot.
  deepLink: string | null;
}
