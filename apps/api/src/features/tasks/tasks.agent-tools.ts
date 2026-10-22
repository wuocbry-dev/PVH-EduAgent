import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import {
  jsonResult,
  type AgentContext,
  type AgentToolProvider,
} from '../agent/agent-tool.js';
import { TasksService } from './tasks.service.js';

@Injectable()
export class TasksAgentTools implements AgentToolProvider {
  constructor(private readonly tasks: TasksService) {}

  buildTools({ user }: AgentContext) {
    return [
      tool(
        'check_deadlines',
        'Liệt kê công việc chưa xong sắp đến hạn trong N giờ tới, kèm các việc đã quá hạn (overdue = true).',
        { withinHours: z.number().int().min(1).max(720).default(48) },
        async ({ withinHours }) =>
          jsonResult(await this.tasks.listDeadlines(user, withinHours)),
        { annotations: { readOnlyHint: true } },
      ),
    ];
  }
}
