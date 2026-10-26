import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/queue/redis.service.js';

export const ALBUM_WAIT_MS = 1500;
const ALBUM_MAX_WAIT_MS = 20_000;
const POLL_MS = 200;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Gom các tin của cùng một album (cùng media_group_id) thành MỘT lượt xử lý. Telegram gửi mỗi ảnh một update riêng.
// Tin đầu tiên của album (giành được khoá trong Redis) là "người dẫn": mỗi tin tự xử lý file của mình rồi ghi kết quả
// vào danh sách Redis; người dẫn chờ ngắn (ALBUM_WAIT_MS) cho tới khi không còn tin nào đang xử lý rồi lấy cả danh sách.
// Các tin còn lại trả về null (đã được người dẫn lo). Không có Redis thì mỗi tin tự chạy riêng.
@Injectable()
export class TelegramAlbumService {
  constructor(private readonly redis: RedisService) {}

  async collect<T>(
    chatId: string,
    groupId: string,
    work: () => Promise<T | null>,
    waitMs = ALBUM_WAIT_MS,
  ): Promise<T[] | null> {
    const client = this.redis.client;
    if (!client) {
      const item = await work();
      return item ? [item] : [];
    }
    const base = ['tg', 'album', chatId, groupId];
    const leadKey = this.redis.key(...base, 'lead');
    const pendingKey = this.redis.key(...base, 'pending');
    const itemsKey = this.redis.key(...base, 'items');

    const leader = (await client.set(leadKey, '1', 'EX', 60, 'NX')) === 'OK';
    await client.incr(pendingKey);
    await client.expire(pendingKey, 120);
    try {
      const item = await work();
      if (item) {
        await client.rpush(itemsKey, JSON.stringify(item));
        await client.expire(itemsKey, 120);
      }
    } finally {
      await client.decr(pendingKey);
    }
    if (!leader) return null;

    await sleep(waitMs);
    const deadline = Date.now() + ALBUM_MAX_WAIT_MS;
    while (Number((await client.get(pendingKey)) ?? 0) > 0 && Date.now() < deadline) await sleep(POLL_MS);

    // Gỡ khoá dẫn trước khi đọc: tin đến muộn sẽ thành album mới thay vì bị bỏ rơi.
    await client.del(leadKey);
    const raw = await client.lrange(itemsKey, 0, -1);
    await client.del(itemsKey, pendingKey);
    return raw.map((r) => JSON.parse(r) as T);
  }
}
