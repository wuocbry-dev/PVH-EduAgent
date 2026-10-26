import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { LocalStorageService } from './local-storage.service.js';
import { R2StorageService } from './r2-storage.service.js';
import { StorageService } from './storage.service.js';

// Chọn kho lưu trữ theo STORAGE_DRIVER (local | r2). Mọi nơi khác chỉ inject StorageService.
@Global()
@Module({
  providers: [
    {
      provide: StorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): StorageService =>
        config.get('STORAGE_DRIVER', { infer: true }) === 'r2'
          ? new R2StorageService(config)
          : new LocalStorageService(config),
    },
  ],
  exports: [StorageService],
})
export class StorageModule {}
