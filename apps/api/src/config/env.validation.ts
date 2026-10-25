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
  // Bước 10 – bảo mật HTTP. TRUST_PROXY: số lớp reverse proxy đứng trước API (vd. 1 khi sau nginx) để req.ip
  // là IP thật của client; false = không tin header X-Forwarded-For.
  TRUST_PROXY: z.preprocess(
    (v) => (v === '' || v === undefined ? 'false' : v),
    z
      .string()
      .regex(/^(true|false|\d+)$/, 'Phải là true, false hoặc số lớp proxy')
      .transform((v) => (v === 'true' ? true : v === 'false' ? false : Number(v))),
  ),
  // Kích thước tối đa của body JSON/form (ảnh tải lên có giới hạn riêng 5 MB).
  BODY_LIMIT: z.string().trim().regex(/^\d+(kb|mb)$/i, 'Dạng 1mb hoặc 512kb').default('1mb'),
  // Hạn mức mặc định cho mọi route: THROTTLE_LIMIT lượt / THROTTLE_TTL_SEC giây mỗi tài khoản (hoặc IP nếu chưa đăng nhập).
  THROTTLE_LIMIT: z.coerce.number().int().positive().default(300),
  THROTTLE_TTL_SEC: z.coerce.number().int().positive().default(60),
  // Tắt hẳn @nestjs/throttler (chỉ dùng cho e2e, vì test đăng nhập dồn dập từ một IP). Production phải để false.
  THROTTLE_DISABLED: z.preprocess((v) => (v === '' ? undefined : v), z.stringbool().default(false)),

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
  // Redis cho bộ lập lịch BullMQ (A05, A06, A09). Bỏ trống = tắt bộ lập lịch.
  REDIS_URL: optional(z.string()),
  // Tiền tố khóa BullMQ trong Redis; test dùng tiền tố riêng để không đụng hàng đợi của máy dev.
  BULLMQ_PREFIX: z.string().trim().min(1).default('pvh'),
  // A01–A04 – bot Telegram. Bỏ trống token = tắt bot.
  TELEGRAM_BOT_TOKEN: optional(z.string().trim()),
  // polling: dev, không cần URL public; webhook: production, Telegram gọi POST /api/telegram/webhook;
  // off: không nhận tin (vẫn gửi được thông báo).
  TELEGRAM_MODE: z.enum(['polling', 'webhook', 'off']).default('polling'),
  // Bắt buộc ở chế độ webhook: Telegram gửi lại trong header X-Telegram-Bot-Api-Secret-Token.
  TELEGRAM_WEBHOOK_SECRET: optional(
    z
      .string()
      .regex(/^[A-Za-z0-9_-]{16,256}$/, '16–256 ký tự A-Z, a-z, 0-9, _ hoặc -'),
  ),
  // Tự động gửi thông báo (notifications) qua bot khi có thông báo mới và mỗi phút. e2e đặt false để không
  // gửi thông báo của người dùng thật; test gọi flush() tường minh.
  TELEGRAM_AUTO_NOTIFY: z.preprocess((v) => (v === '' ? undefined : v), z.stringbool().default(true)),
  // URL public của webhook (vd. https://pvh.edu.vn/api/telegram/webhook); có thì API tự gọi setWebhook.
  TELEGRAM_WEBHOOK_URL: optional(z.url()),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(config);
  if (!parsed.success) {
    throw new Error(
      `File .env không hợp lệ:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const problems = productionProblems(parsed.data);
  if (problems.length > 0) {
    throw new Error(`Cấu hình không an toàn:\n- ${problems.join('\n- ')}`);
  }
  return parsed.data;
}

// Các cấu hình chỉ chấp nhận khi phát triển; production gặp chúng thì từ chối khởi động thay vì chạy thiếu an toàn.
export function productionProblems(env: Env): string[] {
  const problems: string[] = [];
  if (env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_MODE === 'webhook' && !env.TELEGRAM_WEBHOOK_SECRET) {
    problems.push('TELEGRAM_MODE=webhook cần TELEGRAM_WEBHOOK_SECRET (webhook không có secret sẽ từ chối mọi request)');
  }
  if (env.NODE_ENV !== 'production') return problems;
  if (env.DEV_AUTH) problems.push('DEV_AUTH phải là false (cho phép chọn tài khoản qua header)');
  if (env.THROTTLE_DISABLED) problems.push('THROTTLE_DISABLED phải là false (đang tắt giới hạn tần suất)');
  if (!env.WEB_ORIGIN.startsWith('https://')) problems.push('WEB_ORIGIN phải là địa chỉ https:// (cookie đăng nhập đặt cờ Secure)');
  if (!env.REDIS_URL) problems.push('REDIS_URL cần có: giới hạn tần suất, OTP Telegram và bộ lập lịch dùng Redis');
  return problems;
}
