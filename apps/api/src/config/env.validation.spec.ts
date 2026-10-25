import { validateEnv } from './env.validation.js';

const base = {
  JWT_ACCESS_SECRET: 'x'.repeat(40),
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
};
const prod = {
  ...base,
  NODE_ENV: 'production',
  WEB_ORIGIN: 'https://pvh.edu.vn',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv – cấu hình bảo mật', () => {
  it('dev chạy với cấu hình tối thiểu và có giá trị mặc định an toàn', () => {
    const env = validateEnv(base);
    expect(env.TRUST_PROXY).toBe(false);
    expect(env.BODY_LIMIT).toBe('1mb');
    expect(env.THROTTLE_DISABLED).toBe(false);
    expect(env.TELEGRAM_MODE).toBe('polling');
  });

  it('TRUST_PROXY nhận true/false/số lớp proxy, từ chối giá trị lạ', () => {
    expect(validateEnv({ ...base, TRUST_PROXY: '1' }).TRUST_PROXY).toBe(1);
    expect(validateEnv({ ...base, TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
    expect(validateEnv({ ...base, TRUST_PROXY: '' }).TRUST_PROXY).toBe(false);
    expect(() => validateEnv({ ...base, TRUST_PROXY: 'yes' })).toThrow(/proxy/);
    expect(() => validateEnv({ ...base, BODY_LIMIT: '100' })).toThrow(/1mb/);
  });

  it('production hợp lệ khởi động được', () => {
    expect(validateEnv(prod).NODE_ENV).toBe('production');
  });

  it('production từ chối DEV_AUTH, tắt throttle, WEB_ORIGIN http và thiếu Redis', () => {
    expect(() => validateEnv({ ...prod, DEV_AUTH: 'true' })).toThrow(/DEV_AUTH/);
    expect(() => validateEnv({ ...prod, THROTTLE_DISABLED: 'true' })).toThrow(/THROTTLE_DISABLED/);
    expect(() => validateEnv({ ...prod, WEB_ORIGIN: 'http://pvh.edu.vn' })).toThrow(/https/);
    expect(() => validateEnv({ ...prod, REDIS_URL: '' })).toThrow(/REDIS_URL/);
  });

  it('webhook Telegram có token mà thiếu secret thì từ chối (mọi môi trường)', () => {
    const webhook = { ...base, TELEGRAM_BOT_TOKEN: '1:abc', TELEGRAM_MODE: 'webhook' };
    expect(() => validateEnv(webhook)).toThrow(/TELEGRAM_WEBHOOK_SECRET/);
    expect(validateEnv({ ...webhook, TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32) }).TELEGRAM_MODE).toBe('webhook');
  });
});
