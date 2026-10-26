import { PayloadTooLargeException } from '@nestjs/common';
import type { Request, Response } from 'express';

// File .xlsx gửi thẳng làm nội dung request (không multipart). Đọc có giới hạn dung lượng: vượt thì dừng ngay, trả 413
// và đóng kết nối (không đệm hết, không dùng `for await` vì thoát sớm sẽ huỷ socket trước khi kịp trả lỗi).
export function readLimitedBody(req: Request, res: Response, maxBytes: number): Promise<Buffer> {
  const tooLarge = () =>
    new PayloadTooLargeException(`File quá lớn (tối đa ${maxBytes / 1024 / 1024} MB)`);
  if (Number(req.headers['content-length'] ?? 0) > maxBytes) {
    res.setHeader('Connection', 'close');
    return Promise.reject(tooLarge());
  }
  return new Promise<Buffer>((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.removeAllListeners('data');
        req.pause();
        res.setHeader('Connection', 'close');
        fail(tooLarge());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => done(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}
