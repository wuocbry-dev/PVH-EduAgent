import { defineConfig } from 'vitest/config';

// Mỗi lần chạy e2e dùng một tiền tố khóa BullMQ riêng: không đụng hàng đợi của API đang chạy trên máy dev
// (worker bên đó sẽ không nhặt job của test) và được dọn sạch khi chạy xong (test/global-setup.ts).
const prefix = `pvh-test-${Date.now()}`;
process.env.BULLMQ_PREFIX = prefix;

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Bot Telegram trong e2e: token giả, chế độ webhook không đăng ký URL → không bao giờ gọi Telegram thật
    // (kể cả khi .env của máy dev có token và đang polling); test chặn mọi lệnh gọi Bot API (telegram.e2e-spec.ts).
    env: {
      BULLMQ_PREFIX: prefix,
      TELEGRAM_BOT_TOKEN: '123456789:pvh-e2e-fake-token',
      TELEGRAM_MODE: 'webhook',
      TELEGRAM_WEBHOOK_SECRET: 'pvh-e2e-webhook-secret',
      TELEGRAM_WEBHOOK_URL: '',
    },
    globalSetup: ['./test/global-setup.ts'],
    // Các file dùng chung một CSDL và tài khoản seed (có test tạm đổi mật khẩu, quyền vai trò) nên chạy tuần tự.
    fileParallelism: false,
  },
});
