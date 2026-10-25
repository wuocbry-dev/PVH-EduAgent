import { z } from 'zod';

// Biến để trống trong .env (vd. `ANTHROPIC_API_KEY=`) được coi như chưa đặt.
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  API_PORT: z.coerce.number().int().default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:3000'),

  // F10 – xác thực JWT. Bí mật ký access token và token đặt lại mật khẩu.
  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'Cần ít nhất 32 ký tự (vd. openssl rand -hex 32)'),
  // Cho phép chọn tài khoản qua header x-dev-user-email (chỉ khi NODE_ENV=development).
  DEV_AUTH: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.stringbool().default(false),
  ),

  // AI Agent (Claude Agent SDK). Không bắt buộc lúc khởi động để các phân hệ
  // khác vẫn chạy được; endpoint agent sẽ trả 503 nếu thiếu cả key lẫn token.
  // Key Anthropic (gửi qua header x-api-key).
  ANTHROPIC_API_KEY: optional(z.string().trim()),
  // Token của gateway bên thứ 3 (gửi qua header Authorization: Bearer). Nếu đặt
  // biến này thì ANTHROPIC_API_KEY bị bỏ qua.
  ANTHROPIC_AUTH_TOKEN: optional(z.string().trim()),
  // Endpoint của nhà cung cấp key bên thứ 3; bỏ trống để gọi thẳng api.anthropic.com.
  ANTHROPIC_BASE_URL: optional(z.url()),
  AGENT_MODEL: z.string().default('claude-sonnet-4-6'),
  // Model nhỏ Claude Code dùng cho tác vụ phụ; đặt khi gateway không có model mặc định.
  AGENT_SMALL_MODEL: optional(z.string().trim()),
  AGENT_API_TIMEOUT_MS: z.coerce.number().int().positive().default(600_000),
  AGENT_MAX_TURNS: z.coerce.number().int().positive().default(8),
  AGENT_MAX_BUDGET_USD: z.coerce.number().positive().default(0.5),

  // F01–F07 – bí mật dùng chung với web để API báo web làm mới cache khi đăng/gỡ bài
  // (phải trùng REVALIDATE_SECRET của apps/web). Bỏ trống = không gọi web.
  REVALIDATE_SECRET: optional(z.string().min(16)),

  // F13 – thư mục lưu ảnh tải lên (tương đối so với thư mục chạy API, hoặc đường dẫn tuyệt đối).
  UPLOAD_DIR: z.string().trim().min(1).default('uploads'),

  DATABASE_URL: z
    .string()
    .regex(
      /^postgres(ql)?:\/\//,
      'Phải có dạng postgresql://user:pass@host:5432/db',
    ),
  REDIS_URL: optional(z.string()),
  TELEGRAM_BOT_TOKEN: optional(z.string()),
  TELEGRAM_WEBHOOK_SECRET: optional(z.string()),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `File .env không hợp lệ:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}
