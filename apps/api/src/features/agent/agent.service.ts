import { createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentChatResponse } from '@pvh/shared';
import type { Env } from '../../config/env.validation.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import {
  AGENT_TOOL_PROVIDERS,
  type AgentContext,
  type AgentToolProvider,
} from './agent-tool.js';
import { buildSystemPrompt } from './prompts/system-prompt.js';
import { withAudit } from './with-audit.js';

const MCP_SERVER_NAME = 'eduagent';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly audit: AuditLogService,
    @Inject(AGENT_TOOL_PROVIDERS)
    private readonly providers: AgentToolProvider[],
  ) {}

  async chat(ctx: AgentContext, message: string): Promise<AgentChatResponse> {
    const claudeEnv = this.buildClaudeEnv();

    // Bộ tool được dựng theo từng người dùng: mỗi tool đã gắn sẵn user để kiểm tra quyền.
    const tools = this.providers
      .flatMap((p) => p.buildTools(ctx))
      .map((t) => withAudit(t, ctx, this.audit));

    const conversation = query({
      prompt: message,
      options: {
        model: this.config.get('AGENT_MODEL', { infer: true }),
        systemPrompt: buildSystemPrompt(ctx),
        // Tắt toàn bộ tool có sẵn của Claude Code (Bash, Read, Edit, WebFetch...):
        // agent chỉ được dùng các tool nghiệp vụ của hệ thống.
        tools: [],
        mcpServers: {
          [MCP_SERVER_NAME]: createSdkMcpServer({
            name: MCP_SERVER_NAME,
            version: '1.0.0',
            tools,
          }),
        },
        // Chỉ dùng MCP server ở trên; bỏ qua .mcp.json, plugin và connector claude.ai trên máy chủ.
        strictMcpConfig: true,
        settings: { disableClaudeAiConnectors: true },
        allowedTools: tools.map((t) => `mcp__${MCP_SERVER_NAME}__${t.name}`),
        permissionMode: 'dontAsk',
        // Không đọc ~/.claude hay CLAUDE.md trên máy chủ, không lưu phiên ra đĩa.
        settingSources: [],
        persistSession: false,
        maxTurns: this.config.get('AGENT_MAX_TURNS', { infer: true }),
        maxBudgetUsd: this.config.get('AGENT_MAX_BUDGET_USD', { infer: true }),
        env: claudeEnv,
      },
    });

    for await (const msg of conversation) {
      if (msg.type !== 'result') continue;
      // Lỗi API (sai key, hết credit, hết hạn mức...) vẫn về dạng `success` với
      // is_error = true và nội dung lỗi trong `result`, nên phải kiểm tra cả hai.
      if (msg.subtype === 'success' && !msg.is_error) {
        return {
          reply: msg.result,
          numTurns: msg.num_turns,
          costUsd: msg.total_cost_usd,
        };
      }
      const detail =
        msg.subtype === 'success' ? msg.result : msg.errors.join('; ');
      this.logger.error(
        `Agent dừng với lỗi ${msg.subtype}: ${detail} (user ${ctx.user.id})`,
      );
      break;
    }
    throw new InternalServerErrorException(
      'AI Agent không hoàn thành được yêu cầu',
    );
  }

  // Biến môi trường cho tiến trình Claude Code mà Agent SDK khởi chạy.
  // Chỉ truyền đúng một loại credential: key Anthropic (x-api-key) hoặc token
  // gateway (Bearer). Giá trị `undefined` xoá biến kế thừa từ process.env.
  private buildClaudeEnv(): Record<string, string | undefined> {
    const authToken = this.config.get('ANTHROPIC_AUTH_TOKEN', { infer: true });
    const apiKey = this.config.get('ANTHROPIC_API_KEY', { infer: true });
    if (!authToken && !apiKey) {
      throw new ServiceUnavailableException(
        'Chưa cấu hình ANTHROPIC_API_KEY hoặc ANTHROPIC_AUTH_TOKEN cho AI Agent',
      );
    }
    const smallModel = this.config.get('AGENT_SMALL_MODEL', { infer: true });

    return {
      ...process.env,
      ANTHROPIC_AUTH_TOKEN: authToken,
      ANTHROPIC_API_KEY: authToken ? undefined : apiKey,
      ANTHROPIC_BASE_URL: this.config.get('ANTHROPIC_BASE_URL', {
        infer: true,
      }),
      ANTHROPIC_DEFAULT_HAIKU_MODEL: smallModel,
      API_TIMEOUT_MS: String(
        this.config.get('AGENT_API_TIMEOUT_MS', { infer: true }),
      ),
      // Máy chủ không cần telemetry, kiểm tra cập nhật... của Claude Code.
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      CLAUDE_AGENT_SDK_CLIENT_APP: 'pvh-eduagent/0.1.0',
    };
  }
}
