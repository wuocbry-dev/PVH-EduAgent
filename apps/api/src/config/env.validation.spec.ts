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

describe('validateEnv – lưu trữ ảnh/video (bước 11)', () => {
  const r2 = {
    STORAGE_DRIVER: 'r2',
    R2_ACCOUNT_ID: 'a'.repeat(32),
    R2_ACCESS_KEY_ID: 'key',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'pvh',
    R2_PUBLIC_BASE_URL: 'https://media.pvh.edu.vn/',
    R2_PRIVATE_BUCKET: 'pvh-library',
  };

  it('mặc định là local và không cần biến R2 (để trống cũng được)', () => {
    expect(validateEnv(base).STORAGE_DRIVER).toBe('local');
    expect(validateEnv({ ...base, STORAGE_DRIVER: '', R2_BUCKET: '' }).STORAGE_DRIVER).toBe('local');
    expect(() => validateEnv({ ...base, STORAGE_DRIVER: 's3' })).toThrow(/STORAGE_DRIVER/);
  });

  it('driver r2 bắt buộc đủ 5 biến; địa chỉ công khai bỏ dấu / cuối', () => {
    expect(validateEnv({ ...base, ...r2 }).R2_PUBLIC_BASE_URL).toBe('https://media.pvh.edu.vn');
    for (const key of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_PUBLIC_BASE_URL']) {
      expect(() => validateEnv({ ...base, ...r2, [key]: '' })).toThrow(new RegExp(key));
    }
    expect(() => validateEnv({ ...base, ...r2, R2_ACCOUNT_ID: 'khong-phai-hex' })).toThrow(/Account ID/);
  });

  it('production với r2 phải dùng địa chỉ công khai https', () => {
    expect(() => validateEnv({ ...prod, ...r2, R2_PUBLIC_BASE_URL: 'http://pub-x.r2.dev' })).toThrow(/https/);
    expect(validateEnv({ ...prod, ...r2 }).STORAGE_DRIVER).toBe('r2');
  });

  it('thư viện số (bước 21): kho riêng tư khác kho công khai; production với r2 bắt buộc có bucket riêng tư', () => {
    expect(validateEnv({ ...base, ...r2, R2_PRIVATE_BUCKET: '' }).R2_PRIVATE_BUCKET).toBeUndefined(); // dev: dùng thư mục local
    expect(() => validateEnv({ ...prod, ...r2, R2_PRIVATE_BUCKET: '' })).toThrow(/R2_PRIVATE_BUCKET/);
    expect(() => validateEnv({ ...base, ...r2, R2_PRIVATE_BUCKET: 'pvh' })).toThrow(/R2_PRIVATE_BUCKET/);
    expect(() => validateEnv({ ...base, PRIVATE_UPLOAD_DIR: 'uploads' })).toThrow(/PRIVATE_UPLOAD_DIR/);
    expect(validateEnv(base).PRIVATE_UPLOAD_DIR).toBe('uploads-private');
  });
});

