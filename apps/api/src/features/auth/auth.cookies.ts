import type { CookieOptions, Request, Response } from 'express';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  type ClientMeta,
  type TokenPair,
} from './token.service.js';

// Tên cookie phải khớp với apps/web/src/features/auth/config.ts.
export const ACCESS_COOKIE = 'pvh_access';
export const REFRESH_COOKIE = 'pvh_refresh';

const baseOptions = (secure: boolean): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure,
  path: '/',
});

export function setAuthCookies(
  res: Response,
  tokens: TokenPair,
  secure: boolean,
): void {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...baseOptions(secure),
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...baseOptions(secure),
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response, secure: boolean): void {
  res.clearCookie(ACCESS_COOKIE, baseOptions(secure));
  res.clearCookie(REFRESH_COOKIE, baseOptions(secure));
}

export function readCookie(req: Request, name: string): string | undefined {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' && value ? value : undefined;
}

export function clientMeta(req: Request): ClientMeta {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}
