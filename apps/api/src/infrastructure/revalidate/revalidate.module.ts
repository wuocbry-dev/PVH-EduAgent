import { Global, Module } from '@nestjs/common';
import { RevalidateService } from './revalidate.service.js';

@Global()
@Module({
  providers: [RevalidateService],
  exports: [RevalidateService],
})
export class RevalidateModule {}
