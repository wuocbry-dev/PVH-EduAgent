import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ACTIVATION_CODE_TTL_DAYS } from '@pvh/shared';
import type { Env } from '../../config/env.validation.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

// Bỏ ký tự dễ nhầm: 0/O, 1/I/L. 31 ký tự × 10 vị trí ≈ 49 bit.
export const ACTIVATION_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

// Mật khẩu của tài khoản chưa kích hoạt: không phải định dạng scrypt nên verifyPassword luôn trả false.
export const UNUSABLE_PASSWORD_HASH = '!unusable';

export interface IssuedCode {
  userId: string;
  code: string; // dạng XXXXX-XXXXX, chỉ tồn tại trong bộ nhớ lúc phát hành
  expiresAt: Date;
}

export function generateActivationCode(): string {
  let raw = '';
  for (let i = 0; i < CODE_LENGTH; i++) raw += ACTIVATION_ALPHABET[randomInt(ACTIVATION_ALPHABET.length)];
  return `${raw.slice(0, 5)}-${raw.slice(5)}`;
}

// Bỏ khoảng trắng và dấu gạch, viết hoa. Không hợp lệ (sai độ dài/ký tự) thì trả null.
export function normalizeActivationCode(input: string): string | null {
  const raw = input.replace(/[\s-]/g, '').toUpperCase();
  if (raw.length !== CODE_LENGTH) return null;
  for (const ch of raw) if (!ACTIVATION_ALPHABET.includes(ch)) return null;
  return raw;
}

// Mã kích hoạt dùng một lần (bước 14). Chỉ lưu HMAC-SHA256 (khoá từ JWT_ACCESS_SECRET, gắn với userId),
// hết hạn sau 14 ngày; cấp mã mới thì mã cũ bị thu hồi.
@Injectable()
export class ActivationService {
  private readonly key: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.key = Buffer.from(`activation-code:${config.get('JWT_ACCESS_SECRET', { infer: true })}`);
  }

  hash(userId: string | bigint, normalizedCode: string): string {
    return createHmac('sha256', this.key).update(`${userId}:${normalizedCode}`).digest('hex');
  }

  // Cấp mã mới cho nhiều tài khoản trong cùng transaction với việc tạo/sửa tài khoản.
  async issueMany(
    tx: Prisma.TransactionClient,
    userIds: bigint[],
    createdBy: string | null,
  ): Promise<IssuedCode[]> {
    if (userIds.length === 0) return [];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ACTIVATION_CODE_TTL_DAYS * DAY_MS);
    await tx.activationCode.updateMany({
      where: { userId: { in: userIds }, usedAt: null, revokedAt: null },
      data: { revokedAt: now },
    });
    const issued = userIds.map((id) => ({ userId: id, code: generateActivationCode() }));
    await tx.activationCode.createMany({
      data: issued.map((i) => ({
        userId: i.userId,
        codeHash: this.hash(i.userId, normalizeActivationCode(i.code)!),
        expiresAt,
        createdBy: createdBy ? BigInt(createdBy) : null,
      })),
    });
    return issued.map((i) => ({ userId: i.userId.toString(), code: i.code, expiresAt }));
  }

  async issue(
    tx: Prisma.TransactionClient,
    userId: bigint,
    createdBy: string | null,
  ): Promise<IssuedCode> {
    return (await this.issueMany(tx, [userId], createdBy))[0]!;
  }

  // Đổi mã lấy mật khẩu mới trong một transaction. Mã đúng, chưa dùng, chưa thu hồi, chưa hết hạn → true.
  // Cập nhật có điều kiện (used_at IS NULL) nên hai request song song chỉ một request thành công.
  async redeem(userId: string, rawCode: string, passwordHash: string): Promise<boolean> {
    const code = normalizeActivationCode(rawCode);
    const expected = code ? this.hash(userId, code) : null;
    const candidates = await this.prisma.activationCode.findMany({
      where: { userId: BigInt(userId), usedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { id: 'desc' },
      take: 3,
    });
    const match = expected
      ? candidates.find((c) => safeEqualHex(c.codeHash, expected))
      : undefined;
    if (!match) return false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const used = await tx.activationCode.updateMany({
          where: { id: match.id, usedAt: null, revokedAt: null },
          data: { usedAt: new Date() },
        });
        // Tài khoản bị khóa không kích hoạt được (đặt lại mật khẩu cũng không mở khóa).
        const updated = await tx.user.updateMany({
          where: { id: BigInt(userId), status: { in: ['PENDING', 'ACTIVE'] } },
          data: { passwordHash, status: 'ACTIVE' },
        });
        if (used.count !== 1 || updated.count !== 1) throw new RedeemRejected();
      });
      return true;
    } catch (err) {
      if (err instanceof RedeemRejected) return false;
      throw err;
    }
  }
}

class RedeemRejected extends Error {}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && timingSafeEqual(x, y);
}
