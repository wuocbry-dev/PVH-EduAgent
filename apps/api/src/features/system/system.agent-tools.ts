import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import {
  jsonResult,
  type AgentContext,
  type AgentToolProvider,
} from '../agent/agent-tool.js';
import { SystemService } from './system.service.js';

@Injectable()
export class SystemAgentTools implements AgentToolProvider {
  constructor(private readonly system: SystemService) {}

  buildTools({ user }: AgentContext) {
    return [
      tool(
        'get_system_status',
        'Xem tình trạng hệ thống: thời gian chạy, bộ nhớ, kết nối CSDL, số bài chờ duyệt và số bài đã hẹn giờ.',
        {},
        async () => jsonResult(await this.system.getStatus(user)),
        { annotations: { readOnlyHint: true } },
      ),
      tool(
        'summarize_day',
        'Tóm tắt hôm nay (giờ Việt Nam): công việc quá hạn hoặc đến hạn hôm nay và các bài hẹn đăng hôm nay. Chỉ gồm phần người dùng được phép xem.',
        {},
        async () => jsonResult(await this.system.summarizeDay(user)),
        { annotations: { readOnlyHint: true } },
      ),
    ];
  }
}
