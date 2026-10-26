import { ConfigService } from '@nestjs/config';
import type { Api } from 'grammy';
import { TelegramFileService } from './telegram-file.service.js';

const TOKEN = '123456789:AA-token-bi-mat-khong-duoc-lo';
const service = () => new TelegramFileService(new ConfigService({ TELEGRAM_BOT_TOKEN: TOKEN }) as never);
const api = (file: object) => ({ getFile: async () => file }) as unknown as Api;

describe('TelegramFileService', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('tải file qua Bot API và trả đúng nội dung', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(Buffer.from('noi dung'), { status: 200 })));
    const data = await service().download(api({ file_id: 'f', file_path: 'photos/a.jpg', file_size: 8 }), 'f');
    expect(data.toString()).toBe('noi dung');
  });

  it('file khai báo hoặc thực tế lớn hơn giới hạn thì từ chối (413), không đọc hết', async () => {
    const fetchMock = vi.fn(async () => new Response(Buffer.alloc(2000), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(service().download(api({ file_id: 'f', file_path: 'p', file_size: 5000 }), 'f', 1000)).rejects.toThrow(/20 MB/);
    expect(fetchMock).not.toHaveBeenCalled();
    await expect(service().download(api({ file_id: 'f', file_path: 'p' }), 'f', 1000)).rejects.toThrow(/20 MB/);
  });

  it('lỗi mạng/HTTP không bao giờ lộ URL hay token bot trong thông báo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(`connect ECONNREFUSED https://api.telegram.org/file/bot${TOKEN}/photos/a.jpg`);
      }),
    );
    const err = (await service().download(api({ file_id: 'f', file_path: 'photos/a.jpg' }), 'f').catch((e: Error) => e)) as Error;
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).not.toContain('api.telegram.org');
    expect(err.message).toContain('Không tải được file');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('x', { status: 404 })));
    const err2 = (await service().download(api({ file_id: 'f', file_path: 'photos/a.jpg' }), 'f').catch((e: Error) => e)) as Error;
    expect(JSON.stringify(err2)).not.toContain(TOKEN);
    expect(err2.message).toContain('404');
  });

  it('thiếu đường dẫn file từ Telegram hoặc chưa cấu hình token thì báo lỗi tiếng Việt', async () => {
    await expect(service().download(api({ file_id: 'f' }), 'f')).rejects.toThrow(/đường dẫn/);
    const noToken = new TelegramFileService(new ConfigService({}) as never);
    await expect(noToken.download(api({}), 'f')).rejects.toThrow(/chưa được cấu hình/);
  });
});
