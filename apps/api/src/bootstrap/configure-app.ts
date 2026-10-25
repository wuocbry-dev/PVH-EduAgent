import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { Env } from '../config/env.validation.js';
import { DEV_USER_HEADER } from '../features/auth/jwt-auth.guard.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Cấu hình HTTP dùng chung cho main.ts và test bảo mật (không gồm setGlobalPrefix).
// - helmet: header bảo mật (API chỉ trả JSON/ảnh nên CSP chặn mọi nguồn, cấm nhúng iframe)
// - trust proxy: req.ip là IP thật của client khi sau reverse proxy (TRUST_PROXY)
// - giới hạn kích thước body JSON/form (BODY_LIMIT)
// - CORS chỉ cho WEB_ORIGIN, kèm cookie
// - chống CSRF cho cookie đăng nhập: request ghi có header Origin lạ bị từ chối (SameSite=Lax là lớp thứ nhất)
// - nhật ký truy cập dạng một dòng cho mỗi request (không ghi query string, cookie hay body)
export function configureApp(app: NestExpressApplication, { accessLog = true } = {}): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const webOrigin = new URL(config.get('WEB_ORIGIN', { infer: true })).origin;
  const devAuth =
    config.get('NODE_ENV', { infer: true }) === 'development' && config.get('DEV_AUTH', { infer: true });

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      // Ảnh công khai (/media/files) tự đặt cross-origin; còn lại chỉ cho cùng site.
      crossOriginResourcePolicy: { policy: 'same-site' },
      referrerPolicy: { policy: 'no-referrer' },
    }),
  );

  const limit = config.get('BODY_LIMIT', { infer: true });
  app.useBodyParser('json', { limit });
  app.useBodyParser('urlencoded', { limit, extended: false });
  app.use(cookieParser());

  app.enableCors({
    origin: webOrigin,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', ...(devAuth ? [DEV_USER_HEADER] : [])],
    maxAge: 600,
  });

  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.get('origin');
    if (UNSAFE_METHODS.has(req.method) && origin && origin !== webOrigin) {
      res.status(403).json({ statusCode: 403, message: 'Nguồn yêu cầu không hợp lệ' });
      return;
    }
    next();
  });

  if (accessLog) {
    const logger = new Logger('HTTP');
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        const user = (req as Request & { user?: { id?: string } }).user?.id;
        logger.log({
          message: 'request',
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          ms: Math.round(ms),
          ip: req.ip,
          userId: user,
        });
      });
      next();
    });
  }
}
