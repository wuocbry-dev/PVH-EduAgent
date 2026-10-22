import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { jwtVerify, SignJWT } from 'jose';
import type { Env } from '../../config/env.validation.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
const RESET_TOKEN_TTL_SECONDS = 30 * 60;
const REUSE_GRACE_MS = 10_000;

type TokenType = 'access' | 'reset';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export type RotateResult =
  | { ok: true; userId: string; tokens: TokenPair }
  | { ok: false; userId?: string };

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = new TextEncoder().encode(
      config.get('JWT_ACCESS_SECRET', { infer: true }),
    );
  }

  // Cấp cặp token mới: access JWT 15 phút + refresh token ngẫu nhiên 7 ngày (lưu bản băm).
  async issue(userId: string, meta: ClientMeta): Promise<TokenPair> {
    const refreshToken = randomBytes(32).toString('base64url');
    await this.prisma.refreshToken.create({
      data: {
        userId: BigInt(userId),
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 255),
      },
    });
    return {
      accessToken: await this.sign(userId, 'access', ACCESS_TOKEN_TTL_SECONDS),
      refreshToken,
    };
  }

  async verifyAccess(token: string): Promise<string | null> {
    const payload = await this.verify(token, 'access');
    return payload?.sub ?? null;
  }

  // Refresh token chỉ dùng được một lần. Dùng lại token đã thu hồi quá thời gian ân hạn
  // (có thể bị lộ) thì thu hồi toàn bộ phiên của tài khoản đó. Ân hạn ngắn để các
  // request song song của cùng trình duyệt không bị coi là đánh cắp.
  async rotate(refreshToken: string, meta: ClientMeta): Promise<RotateResult> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored) return { ok: false };
    const userId = stored.userId.toString();

    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      const revokedMs =
        Date.now() - (stored.revokedAt?.getTime() ?? Date.now());
      if (revokedMs > REUSE_GRACE_MS) await this.revokeAll(userId);
      return { ok: false, userId };
    }
    if (stored.expiresAt <= new Date()) return { ok: false, userId };

    return { ok: true, userId, tokens: await this.issue(userId, meta) };
  }

  // Trả về id người dùng của token (nếu có) để ghi audit log.
  async revoke(refreshToken: string): Promise<string | null> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored) return null;
    await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return stored.userId.toString();
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId: BigInt(userId), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // Token đặt lại mật khẩu gắn dấu vân tay của password_hash hiện tại,
  // nên tự mất hiệu lực ngay khi mật khẩu đã được đổi (dùng một lần).
  signReset(userId: string, passwordHash: string): Promise<string> {
    return this.sign(userId, 'reset', RESET_TOKEN_TTL_SECONDS, {
      pwd: this.passwordFingerprint(passwordHash),
    });
  }

  async verifyReset(
    token: string,
  ): Promise<{ userId: string; pwd: string } | null> {
    const payload = await this.verify(token, 'reset');
    if (!payload?.sub || typeof payload['pwd'] !== 'string') return null;
    return { userId: payload.sub, pwd: payload['pwd'] };
  }

  passwordFingerprint(passwordHash: string): string {
    return sha256(passwordHash).slice(0, 16);
  }

  private sign(
    userId: string,
    typ: TokenType,
    ttlSeconds: number,
    claims: Record<string, string> = {},
  ): Promise<string> {
    return new SignJWT({ ...claims, typ })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuedAt()
      .setExpirationTime(`${ttlSeconds}s`)
      .sign(this.secret);
  }

  private async verify(token: string, typ: TokenType) {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        algorithms: ['HS256'],
      });
      return payload['typ'] === typ ? payload : null;
    } catch {
      return null;
    }
  }
}
