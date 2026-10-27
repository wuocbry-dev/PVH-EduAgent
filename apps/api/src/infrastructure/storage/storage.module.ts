import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.validation.js';
import { LocalPrivateStorageService } from './local-private-storage.service.js';
import { LocalStorageService } from './local-storage.service.js';
import { PrivateStorageService } from './private-storage.service.js';
import { R2PrivateStorageService } from './r2-private-storage.service.js';
import { R2StorageService } from './r2-storage.service.js';
import { StorageService } from './storage.service.js';

// Chọn kho lưu trữ theo STORAGE_DRIVER (local | r2). Mọi nơi khác chỉ inject StorageService (kho công khai: ảnh/video
// của bài viết, ảnh bìa) hoặc PrivateStorageService (kho riêng tư: file tài liệu của thư viện số).
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
    {
      provide: PrivateStorageService,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): PrivateStorageService => {
        const bucket = config.get('R2_PRIVATE_BUCKET', { infer: true });
        if (config.get('STORAGE_DRIVER', { infer: true }) === 'r2') {
          if (bucket) return new R2PrivateStorageService(config, bucket);
          // Production đã bị chặn khởi động khi thiếu bucket (productionProblems); dev thì nhắc và dùng thư mục local.
          new Logger('StorageModule').warn('Chưa có R2_PRIVATE_BUCKET: thư viện số lưu file ở PRIVATE_UPLOAD_DIR');
        }
        return new LocalPrivateStorageService(config);
      },
    },
  ],
  exports: [StorageService, PrivateStorageService],
})
export class StorageModule {}
