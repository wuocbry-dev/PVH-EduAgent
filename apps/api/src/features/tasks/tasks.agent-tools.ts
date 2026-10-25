import { tool } from '@anthropic-ai/claude-agent-sdk';
import { BadRequestException, Injectable } from '@nestjs/common';
import { SETTABLE_TASK_STATUSES, TASK_PRIORITIES } from '@pvh/shared';
import { z } from 'zod';
import {
  jsonResult,
  type AgentContext,
  type AgentToolProvider,
} from '../agent/agent-tool.js';
import { createTaskSchema } from './dto/tasks.dto.js';
import { TasksService } from './tasks.service.js';

// Mọi tool gọi service để service tự kiểm tra quyền; quyền không do LLM quyết định.
@Injectable()
export class TasksAgentTools implements AgentToolProvider {
  constructor(private readonly tasks: TasksService) {}

  buildTools({ user, channel }: AgentContext) {
    const meta = { channel };
    return [
      tool(
        'check_deadlines',
        'Liệt kê công việc chưa xong sắp đến hạn trong N giờ tới, kèm các việc đã quá hạn (overdue = true).',
        { withinHours: z.number().int().min(1).max(720).default(48) },
        async ({ withinHours }) =>
          jsonResult(await this.tasks.listDeadlines(user, withinHours)),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'list_assignees',
        'Liệt kê nhân sự có thể được giao việc (id và họ tên). Dùng để tìm assigneeId trước khi tạo việc.',
        {},
        async () => jsonResult(await this.tasks.listAssignees(user)),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'update_task_status',
        'Đổi trạng thái một công việc (TODO, IN_PROGRESS, DONE). Chỉ người được giao việc hoặc người có quyền giao việc mới làm được; DONE sẽ ghi thời điểm hoàn thành.',
        {
          taskId: z.string().describe('id công việc, lấy từ check_deadlines'),
          status: z.enum(SETTABLE_TASK_STATUSES),
        },
        async ({ taskId, status }) =>
          jsonResult(await this.tasks.setStatus(user, taskId, status, meta)),
      ),
      tool(
        'create_task',
        'Tạo và giao một công việc mới cho nhân sự (chỉ người có quyền giao việc). Hạn chót dueAt là ISO 8601 có múi giờ, ví dụ 2026-11-02T17:00:00+07:00.',
        {
          title: z.string().describe('Tên công việc'),
          description: z.string().optional(),
          assigneeId: z.string().describe('id người phụ trách, lấy từ list_assignees'),
          priority: z.enum(TASK_PRIORITIES).optional(),
          dueAt: z.string().describe('Hạn chót, ISO 8601 có múi giờ'),
        },
        async (args) => {
          const parsed = createTaskSchema.safeParse(args);
          if (!parsed.success) {
            throw new BadRequestException(z.prettifyError(parsed.error));
          }
          return jsonResult(await this.tasks.create(user, parsed.data, meta));
        },
      ),
    ];
  }
}
