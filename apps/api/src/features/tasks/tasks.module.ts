import { Module } from '@nestjs/common';
import { TasksAgentTools } from './tasks.agent-tools.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TasksAgentTools],
  exports: [TasksService, TasksAgentTools],
})
export class TasksModule {}
