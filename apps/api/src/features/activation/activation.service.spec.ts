import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import type { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  ACTIVATION_ALPHABET,
  ActivationService,
  generateActivationCode,
  normalizeActivationCode,
} from './activation.service.js';

const config = (secret: string) => ({ get: () => secret }) as unknown as ConfigService<Env, true>;
const service = (secret = 'bi-mat-cua-test-0123456789abcdef') =>
  new ActivationService({} as PrismaService, config(secret));

describe('mã kích hoạt', () => {
  it('sinh mã dạng XXXXX-XXXXX, chỉ gồm ký tự dễ đọc (không 0/O/1/I/L)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateActivationCode();
      expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
      expect(code).not.toMatch(/[01OIL]/);
    }
    expect(ACTIVATION_ALPHABET).not.toMatch(/[01OIL]/);
  });

  it('các mã sinh ra không trùng nhau (đủ entropy)', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateActivationCode));
    expect(codes.size).toBe(2000);
  });

  it('chuẩn hoá: bỏ khoảng trắng/dấu gạch, viết hoa; sai độ dài hoặc ký tự lạ thì null', () => {
    expect(normalizeActivationCode('abcde-fghjk')).toBe('ABCDEFGHJK');
    expect(normalizeActivationCode(' abcde fghjk ')).toBe('ABCDEFGHJK');
    expect(normalizeActivationCode('ABCDEFGHJ')).toBeNull(); // thiếu 1 ký tự
    expect(normalizeActivationCode('ABCDEFGHJKM')).toBeNull(); // thừa 1 ký tự
    expect(normalizeActivationCode('ABCDE-FGHJ0')).toBeNull(); // có số 0
    expect(normalizeActivationCode("ABCDE'; DROP")).toBeNull();
    expect(normalizeActivationCode('')).toBeNull();
  });

  it('băm HMAC 64 ký tự hex, phụ thuộc cả mã, userId và bí mật; không chứa mã gốc', () => {
    const a = service();
    const hash = a.hash('7', 'ABCDEFGHJK');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('ABCDEFGHJK');
    expect(a.hash('7', 'ABCDEFGHJK')).toBe(hash);
    expect(a.hash('8', 'ABCDEFGHJK')).not.toBe(hash); // cùng mã, khác tài khoản
    expect(a.hash('7', 'ABCDEFGHJM')).not.toBe(hash);
    expect(service('bi-mat-khac-0123456789abcdefgh').hash('7', 'ABCDEFGHJK')).not.toBe(hash);
  });
});
