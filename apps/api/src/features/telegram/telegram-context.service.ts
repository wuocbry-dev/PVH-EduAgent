import { Injectable } from '@nestjs/common';
import type { AgentAttachment } from '@pvh/shared';
import { RedisService } from '../../infrastructure/queue/redis.service.js';

// Ngữ cảnh ngắn của một cuộc soạn bài trong một chat riêng: vài lượt hội thoại gần nhất và các tệp đã gửi mà chưa gắn
// vào bài. Lưu trong Redis (hết hạn sau 30 phút kể từ lần cập nhật cuối); không có Redis thì lưu trong bộ nhớ.
export const CONTEXT_TTL_SEC = 30 * 60;
export const HISTORY_MAX_TURNS = 6; // mỗi lượt = một tin của người dùng + một trả lời của trợ lý
const TEXT_MAX = 600;
const ATTACHMENTS_MAX = 20;
const DEDUPE_TTL_SEC = 5 * 60;

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatContext {
  history: ChatTurn[];
  attachments: AgentAttachment[];
}

const empty = (): ChatContext => ({ history: [], attachments: [] });

@Injectable()
export class TelegramContextService {
  private readonly memory = new Map<string, { value: ChatContext; expiresAt: number }>();
  private readonly seen = new Map<string, number>();

  constructor(private readonly redis: RedisService) {}

  private key(chatId: string) {
    return this.redis.key('tg', 'ctx', chatId);
  }

  async get(chatId: string): Promise<ChatContext> {
    const client = this.redis.client;
    if (client) {
      try {
        const raw = await client.get(this.key(chatId));
        return raw ? { ...empty(), ...(JSON.parse(raw) as Partial<ChatContext>) } : empty();
      } catch {
        // Redis lỗi: dùng bản trong bộ nhớ.
      }
    }
    const entry = this.memory.get(chatId);
    return entry && entry.expiresAt > Date.now() ? entry.value : empty();
  }

  private async save(chatId: string, value: ChatContext): Promise<void> {
    const client = this.redis.client;
    if (client) {
      try {
        await client.set(this.key(chatId), JSON.stringify(value), 'EX', CONTEXT_TTL_SEC);
        return;
      } catch {
        // Redis lỗi: lưu vào bộ nhớ.
      }
    }
    this.memory.set(chatId, { value, expiresAt: Date.now() + CONTEXT_TTL_SEC * 1000 });
  }

  // Đọc-sửa-ghi; các tin của cùng một chat được xử lý lần lượt nên không cần khoá.
  private async update(chatId: string, change: (ctx: ChatContext) => void): Promise<ChatContext> {
    const ctx = await this.get(chatId);
    change(ctx);
    await this.save(chatId, ctx);
    return ctx;
  }

  addAttachments(chatId: string, items: AgentAttachment[]): Promise<ChatContext> {
    return this.update(chatId, (ctx) => {
      ctx.attachments = [...ctx.attachments, ...items].slice(-ATTACHMENTS_MAX);
    });
  }

  // Ghi một lượt hội thoại và bỏ các tệp đã được gắn vào bài (usedMediaIds).
  recordTurn(chatId: string, userText: string, reply: string, usedMediaIds: string[] = []): Promise<ChatContext> {
    return this.update(chatId, (ctx) => {
      ctx.history = [
        ...ctx.history,
        { role: 'user' as const, text: userText.slice(0, TEXT_MAX) },
        { role: 'assistant' as const, text: reply.slice(0, TEXT_MAX) },
      ].slice(-HISTORY_MAX_TURNS * 2);
      const used = new Set(usedMediaIds);
      ctx.attachments = ctx.attachments.filter((a) => !used.has(a.mediaId));
    });
  }

  // /huy: bỏ bản nháp đang soạn (lịch sử + tệp chờ gắn).
  async clear(chatId: string): Promise<void> {
    this.memory.delete(chatId);
    await this.redis.client?.del(this.key(chatId)).catch(() => 0);
  }

  // true nếu đây là lần đầu thấy tin này (Telegram gửi lại cùng một update hoặc người dùng gửi lặp); chống xử lý hai lần.
  async firstTime(chatId: string, messageId: number): Promise<boolean> {
    const client = this.redis.client;
    const id = `${chatId}:${messageId}`;
    if (client) {
      try {
        return (await client.set(this.redis.key('tg', 'seen', id), '1', 'EX', DEDUPE_TTL_SEC, 'NX')) === 'OK';
      } catch {
        // Redis lỗi: dùng bộ nhớ.
      }
    }
    const now = Date.now();
    if ((this.seen.get(id) ?? 0) > now) return false;
    this.seen.set(id, now + DEDUPE_TTL_SEC * 1000);
    if (this.seen.size > 5000) for (const [k, v] of this.seen) if (v <= now) this.seen.delete(k);
    return true;
  }
}
