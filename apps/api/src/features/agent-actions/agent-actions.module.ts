import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { AgentActionsAgentTools } from './agent-actions.agent-tools.js';
import { AgentActionsController } from './agent-actions.controller.js';
import { AgentActionsService } from './agent-actions.service.js';

// A08 – xác nhận 2 bước cho thao tác nhạy cảm của agent (bảng agent_actions).
@Module({
  imports: [PostsModule, SettingsModule],
  controllers: [AgentActionsController],
  providers: [AgentActionsService, AgentActionsAgentTools],
  exports: [AgentActionsService, AgentActionsAgentTools],
})
export class AgentActionsModule {}
