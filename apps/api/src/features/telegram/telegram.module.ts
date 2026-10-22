import { Module } from '@nestjs/common';

// Phân hệ Telegram (A01, A02, A08) — sẽ gồm:
// - telegram.controller.ts    webhook @Public(), kiểm tra header secret TELEGRAM_WEBHOOK_SECRET
// - telegram-link.service.ts  sinh OTP trong CMS, liên kết Telegram ID với tài khoản, lệnh /unlink
// - telegram.service.ts       gửi tin nhắn, nút Xác nhận/Huỷ; chuyển tin nhắn sang
//                             AgentService.chat({ user, channel: 'telegram' }, text)
@Module({})
export class TelegramModule {}
