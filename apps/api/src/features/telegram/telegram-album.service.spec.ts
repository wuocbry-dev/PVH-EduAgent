import type { RedisService } from '../../infrastructure/queue/redis.service.js';
import { TelegramAlbumService } from './telegram-album.service.js';

// Redis giả tối thiểu (đủ các lệnh dịch vụ dùng).
function fakeRedis() {
  const kv = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const bump = (k: string, by: number) => {
    kv.set(k, String(Number(kv.get(k) ?? 0) + by));
    return Number(kv.get(k));
  };
  const client = {
    set: async (k: string, v: string) => {
      if (kv.has(k)) return null;
      kv.set(k, v);
      return 'OK';
    },
    get: async (k: string) => kv.get(k) ?? null,
    incr: async (k: string) => bump(k, 1),
    decr: async (k: string) => bump(k, -1),
    expire: async () => 1,
    rpush: async (k: string, v: string) => {
      lists.set(k, [...(lists.get(k) ?? []), v]);
      return 1;
    },
    lrange: async (k: string) => lists.get(k) ?? [],
    del: async (...ks: string[]) => {
      for (const k of ks) {
        kv.delete(k);
        lists.delete(k);
      }
      return ks.length;
    },
  };
  return { client, key: (...p: string[]) => p.join(':') } as unknown as RedisService;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('TelegramAlbumService – gom album', () => {
  it('3 tin cùng album → đúng một "người dẫn" nhận đủ 3 kết quả, 2 tin còn lại nhận null', async () => {
    const albums = new TelegramAlbumService(fakeRedis());
    const results = await Promise.all([1, 2, 3].map((n) => albums.collect('chat', 'g1', async () => ({ n }), 30)));
    const leaders = results.filter((r) => r !== null);
    expect(leaders).toHaveLength(1);
    expect(leaders[0]!.map((i) => i.n).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(results.filter((r) => r === null)).toHaveLength(2);
  });

  it('người dẫn chờ cả tin còn đang xử lý chậm (tải file lâu hơn thời gian chờ ngắn)', async () => {
    const albums = new TelegramAlbumService(fakeRedis());
    const results = await Promise.all([
      albums.collect('chat', 'g2', async () => ({ n: 1 }), 20),
      albums.collect(
        'chat',
        'g2',
        async () => {
          await sleep(300);
          return { n: 2 };
        },
        20,
      ),
    ]);
    const leader = results.find((r) => r !== null)!;
    expect(leader.map((i) => i.n).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('tin bị từ chối (work trả null) không có trong kết quả; album khác chat tách riêng', async () => {
    const albums = new TelegramAlbumService(fakeRedis());
    const [a, b, c] = await Promise.all([
      albums.collect('chat', 'g3', async () => ({ ok: true }), 20),
      albums.collect('chat', 'g3', async () => null, 20),
      albums.collect('chat2', 'g3', async () => ({ ok: 'khác chat' }), 20),
    ]);
    const first = [a, b].find((r) => r !== null)!;
    expect(first).toEqual([{ ok: true }]);
    expect(c).toEqual([{ ok: 'khác chat' }]);
  });

  it('tin đến muộn sau khi đã chốt album thành album mới (không bị bỏ rơi)', async () => {
    const albums = new TelegramAlbumService(fakeRedis());
    const first = await albums.collect('chat', 'g4', async () => ({ n: 1 }), 10);
    const late = await albums.collect('chat', 'g4', async () => ({ n: 2 }), 10);
    expect(first).toEqual([{ n: 1 }]);
    expect(late).toEqual([{ n: 2 }]);
  });

  it('không có Redis: mỗi tin tự xử lý riêng', async () => {
    const albums = new TelegramAlbumService({ client: undefined, key: (...p: string[]) => p.join(':') } as unknown as RedisService);
    expect(await albums.collect('c', 'g', async () => ({ n: 1 }))).toEqual([{ n: 1 }]);
  });
});
