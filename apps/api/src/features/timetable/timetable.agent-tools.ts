import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { jsonResult, type AgentContext, type AgentToolProvider } from '../agent/agent-tool.js';
import { TimetableViewService } from './timetable-view.service.js';

// Tool chỉ đọc: tra cứu thời khoá biểu ĐÃ CÔNG BỐ. Service tự kiểm tra phạm vi quyền của người hỏi (giáo viên: lịch của mình và
// các lớp mình dạy; học sinh: lớp mình; BGH (timetable:read): tất cả). Không có tool sửa lịch.
@Injectable()
export class TimetableAgentTools implements AgentToolProvider {
  constructor(private readonly views: TimetableViewService) {}

  buildTools({ user }: AgentContext) {
    return [
      tool(
        'get_timetable',
        'Tra cứu thời khoá biểu đã công bố của một giáo viên hoặc một lớp trong một ngày (mặc định hôm nay). Truyền teacherName HOẶC className; không truyền gì thì tra lịch của chính người hỏi. Chỉ trả dữ liệu trong phạm vi quyền của người hỏi.',
        {
          teacherName: z.string().max(120).optional().describe('Họ tên (hoặc một phần) của giáo viên'),
          className: z.string().max(20).optional().describe('Tên lớp, ví dụ 10A1'),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('Ngày cần tra, dạng YYYY-MM-DD; bỏ trống là hôm nay'),
        },
        async (args) => jsonResult(await this.views.lookup(user, args)),
        { annotations: { readOnlyHint: true } },
      ),
    ];
  }
}
