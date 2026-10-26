import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { TeachingController } from './teaching.controller.js';
import { TeachingService } from './teaching.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [TeachingController],
  providers: [TeachingService],
  exports: [TeachingService],
})
export class TeachingModule {}
