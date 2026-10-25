import { ConsoleLogger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap/configure-app.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    // Production: log JSON (mỗi dòng một đối tượng) để công cụ thu log đọc được; dev giữ dạng dễ đọc.
    logger:
      process.env.NODE_ENV === 'production'
        ? new ConsoleLogger({ json: true, colors: false })
        : undefined,
    // Body parser được đặt lại trong configureApp để có giới hạn kích thước.
    bodyParser: false,
  });
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.setGlobalPrefix('api');
  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(config.get('API_PORT', { infer: true }));
}
await bootstrap();
