import { Module } from '@nestjs/common';
import { AgentActionsAgentTools } from '../agent-actions/agent-actions.agent-tools.js';
import { AgentActionsModule } from '../agent-actions/agent-actions.module.js';
import { LibraryAgentTools } from '../library/library.agent-tools.js';
import { LibraryModule } from '../library/library.module.js';
import { PostsAgentTools } from '../posts/posts.agent-tools.js';
import { PostsModule } from '../posts/posts.module.js';
import { SystemAgentTools } from '../system/system.agent-tools.js';
import { SystemModule } from '../system/system.module.js';
import { TasksAgentTools } from '../tasks/tasks.agent-tools.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { TimetableAgentTools } from '../timetable/timetable.agent-tools.js';
import { TimetableModule } from '../timetable/timetable.module.js';
import { AGENT_TOOL_PROVIDERS, type AgentToolProvider } from './agent-tool.js';
import { AgentController } from './agent.controller.js';
import { AgentService } from './agent.service.js';

// Thêm tool cho feature mới: import module của feature và thêm provider vào danh sách này.
const toolProviders = [
  PostsAgentTools,
  TasksAgentTools,
  SystemAgentTools,
  AgentActionsAgentTools,
  TimetableAgentTools,
  LibraryAgentTools,
];

@Module({
  imports: [PostsModule, TasksModule, SystemModule, AgentActionsModule, TimetableModule, LibraryModule],
  controllers: [AgentController],
  providers: [
    AgentService,
    {
      provide: AGENT_TOOL_PROVIDERS,
      useFactory: (...providers: AgentToolProvider[]) => providers,
      inject: toolProviders,
    },
  ],
  exports: [AgentService],
})
export class AgentModule {}
