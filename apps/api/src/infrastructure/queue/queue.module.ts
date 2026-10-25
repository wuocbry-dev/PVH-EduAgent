import { Global, Module } from '@nestjs/common';
import { QueueService } from './queue.service.js';
import { RedisService } from './redis.service.js';

@Global()
@Module({
  providers: [QueueService, RedisService],
  exports: [QueueService, RedisService],
})
export class QueueModule {}
