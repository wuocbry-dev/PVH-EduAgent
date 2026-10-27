import { tool } from '@anthropic-ai/claude-agent-sdk';
import { Injectable } from '@nestjs/common';
import { LIBRARY_KINDS } from '@pvh/shared';
import { z } from 'zod';
import { errorResult, jsonResult, type AgentContext, type AgentToolProvider } from '../agent/agent-tool.js';
import { LibraryService } from './library.service.js';

// Tool chỉ đọc: tra cứu tài liệu ĐÃ ĐĂNG của thư viện số cho giáo viên và nhân sự (service từ chối học sinh). Trả tiêu đề
// và đường dẫn trang tài liệu trên website, không bao giờ trả URL kho riêng tư; tôn trọng đối tượng xem.
@Injectable()
export class LibraryAgentTools implements AgentToolProvider {
  constructor(private readonly library: LibraryService) {}

  buildTools({ user }: AgentContext) {
    return [
      tool(
        'search_library',
        'Tìm tài liệu đã đăng trong thư viện số của trường (sách, sách nói, video bài giảng, đề ôn tập) theo tên, tác giả, mô tả (gõ không dấu cũng được), có thể lọc theo khối và loại. Trả tiêu đề và đường dẫn trang tài liệu trên website (tối đa 10 kết quả). Chỉ dành cho giáo viên và nhân sự.',
        {
          q: z.string().max(100).optional().describe('Từ khoá: tên tài liệu, tác giả, môn học…'),
          gradeLevel: z.number().int().min(10).max(12).optional().describe('Khối liên quan: 10, 11 hoặc 12'),
          kind: z.enum(LIBRARY_KINDS).optional().describe('PDF = sách/tài liệu, AUDIO = sách nói, VIDEO = video'),
        },
        async (args) => {
          try {
            return jsonResult(await this.library.searchForAgent(user, args));
          } catch (err) {
            return errorResult(err instanceof Error ? err.message : String(err));
          }
        },
        { annotations: { readOnlyHint: true } },
      ),
    ];
  }
}
