import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { createPgAdapter } from './pg-adapter.js';

// Một PrismaClient (một connection pool) dùng chung cho cả ứng dụng.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: createPgAdapter(config.get('DATABASE_URL', { infer: true })),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
