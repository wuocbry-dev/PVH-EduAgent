import type { RedisService } from '../../infrastructure/queue/redis.service.js';
import { HISTORY_MAX_TURNS, TelegramContextService } from './telegram-context.service.js';

// Không có Redis: dùng bản trong bộ nhớ (cùng hành vi).
const service = () =>
  new TelegramContextService({ client: undefined, key: (...p: string[]) => p.join(':') } as unknown as RedisService);

const att = (id: string) => ({ mediaId: id, kind: 'IMAGE' as const, size: 10, name: 'ảnh' });

describe('TelegramContextService', () => {
  it('ghi lại lượt hội thoại, cắt bớt cho vừa giới hạn và cắt từng tin quá dài', async () => {
    const s = service();
    for (let i = 0; i < HISTORY_MAX_TURNS + 3; i++) await s.recordTurn('1', `hỏi ${i}`, `đáp ${i}`);
    const ctx = await s.get('1');
    expect(ctx.history).toHaveLength(HISTORY_MAX_TURNS * 2);
    expect(ctx.history[0]).toEqual({ role: 'user', text: 'hỏi 3' });
    expect(ctx.history.at(-1)).toEqual({ role: 'assistant', text: `đáp ${HISTORY_MAX_TURNS + 2}` });

    await s.recordTurn('2', 'x'.repeat(5000), 'y'.repeat(5000));
    expect((await s.get('2')).history.every((h) => h.text.length <= 600)).toBe(true);
  });

  it('tệp đã gắn vào bài (usedMediaIds) bị bỏ khỏi danh sách chờ; tối đa 20 tệp', async () => {
    const s = service();
    await s.addAttachments('1', [att('1'), att('2'), att('3')]);
    await s.recordTurn('1', 'viết bài', 'đã tạo', ['1', '3']);
    expect((await s.get('1')).attachments.map((a) => a.mediaId)).toEqual(['2']);

    await s.addAttachments('9', Array.from({ length: 25 }, (_, i) => att(String(i))));
    const kept = (await s.get('9')).attachments;
    expect(kept).toHaveLength(20);
    expect(kept[0].mediaId).toBe('5');
  });

  it('mỗi chat một ngữ cảnh riêng; /huy (clear) xoá sạch', async () => {
    const s = service();
    await s.addAttachments('a', [att('1')]);
    await s.recordTurn('b', 'hi', 'chào');
    await s.clear('a');
    expect(await s.get('a')).toEqual({ history: [], attachments: [] });
    expect((await s.get('b')).history).toHaveLength(2);
  });

  it('chống xử lý lặp: mỗi (chat, message_id) chỉ "lần đầu" một lần', async () => {
    const s = service();
    expect(await s.firstTime('1', 10)).toBe(true);
    expect(await s.firstTime('1', 10)).toBe(false);
    expect(await s.firstTime('1', 11)).toBe(true);
    expect(await s.firstTime('2', 10)).toBe(true);
  });
});
