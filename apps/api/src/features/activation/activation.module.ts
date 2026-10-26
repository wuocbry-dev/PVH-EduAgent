import { Module } from '@nestjs/common';
import { ActivationService } from './activation.service.js';

@Module({
  providers: [ActivationService],
  exports: [ActivationService],
})
export class ActivationModule {}
