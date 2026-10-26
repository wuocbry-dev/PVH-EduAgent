import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { TimetableAgentTools } from './timetable.agent-tools.js';
import { TimetableController } from './timetable.controller.js';
import { TimetableService } from './timetable.service.js';
import { TimetableViewService } from './timetable-view.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [TimetableController],
  providers: [TimetableService, TimetableViewService, TimetableAgentTools],
  exports: [TimetableService, TimetableViewService, TimetableAgentTools],
})
export class TimetableModule {}
