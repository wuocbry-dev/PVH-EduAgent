import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TELEGRAM_MAX_FILE_BYTES } from '@pvh/shared';
import type { Api } from 'grammy';
import type { Env } from '../../config/env.validation.js';

// Tải file người dùng gửi cho bot (Bot API getFile, tối đa 20 MB). URL tải chứa token bot nên không bao giờ được ghi
// log hay đưa vào thông báo lỗi: mọi lỗi mạng đều được thay bằng thông báo chung.
@Injectable()
export class TelegramFileService {
  private readonly token?: string;

  constructor(config: ConfigService<Env, true>) {
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
  }

  async download(api: Api, fileId: string, maxBytes = TELEGRAM_MAX_FILE_BYTES): Promise<Buffer> {
    if (!this.token) throw new BadRequestException('Bot Telegram chưa được cấu hình');
    const file = await api.getFile(fileId);
    if (!file.file_path) throw new BadRequestException('Telegram không trả về đường dẫn file');
    if (file.file_size && file.file_size > maxBytes) throw new PayloadTooLargeException('File lớn hơn 20 MB');

    let res: Response;
    try {
      res = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`, {
        signal: AbortSignal.timeout(60_000),
      });
    } catch {
      throw new BadRequestException('Không tải được file từ Telegram, vui lòng thử gửi lại');
    }
    if (!res.ok || !res.body) throw new BadRequestException(`Telegram không cho tải file này (mã ${res.status})`);

    const chunks: Buffer[] = [];
    let received = 0;
    try {
      for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
        received += chunk.length;
        if (received > maxBytes) throw new PayloadTooLargeException('File lớn hơn 20 MB');
        chunks.push(Buffer.from(chunk));
      }
    } catch (err) {
      if (err instanceof PayloadTooLargeException) throw err;
      throw new BadRequestException('Không tải được file từ Telegram, vui lòng thử gửi lại');
    }
    return Buffer.concat(chunks);
  }
}
