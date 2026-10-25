import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { SystemAgentTools } from './system.agent-tools.js';
import { SystemController } from './system.controller.js';
import { SystemService } from './system.service.js';

@Module({
  imports: [PostsModule, TasksModule],
  controllers: [SystemController],
  providers: [SystemService, SystemAgentTools],
  exports: [SystemService, SystemAgentTools],
})
export class SystemModule {}
