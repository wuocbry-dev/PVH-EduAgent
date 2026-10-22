import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  // credentials: trình duyệt gửi kèm cookie đăng nhập (pvh_access, pvh_refresh).
  app.enableCors({
    origin: config.get('WEB_ORIGIN', { infer: true }),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(config.get('API_PORT', { infer: true }));
}
await bootstrap();
