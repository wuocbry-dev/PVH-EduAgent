import request from 'supertest';
import type { App } from 'supertest/types.js';
import type { INestApplication } from '@nestjs/common';

// Ảnh PNG 1×1 hợp lệ.
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// MP4 tối thiểu: hộp `ftyp` (brand isom) + dữ liệu giả; đủ để nhận dạng theo magic bytes.
export const MP4 = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from('isomiso2mp41', 'latin1'),
  Buffer.alloc(64, 1),
]);

// WebM tối thiểu: EBML header với DocType "webm".
export const WEBM = Buffer.concat([
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01, 0x42, 0xf2, 0x81, 0x04]),
  Buffer.from([0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84]),
  Buffer.from('webm', 'latin1'),
  Buffer.alloc(64, 2),
]);

type Agent = ReturnType<typeof request.agent>;

export interface UploadOptions {
  // Khai báo gửi lên /media/presign (mặc định đúng với file).
  declaredMime?: string;
  declaredSize?: number;
  // Content-Type khi PUT (mặc định = headers do presign trả về).
  putContentType?: string;
}

// Luồng tải lên đầy đủ giống trình duyệt: presign → PUT thẳng tới uploadUrl → complete. Trả về phản hồi của
// `complete` (hoặc của presign nếu presign đã thất bại); ném lỗi nếu mã trạng thái không phải 200.
export async function uploadMedia(
  app: INestApplication<App>,
  agent: Agent,
  buffer: Buffer,
  mimeType: string,
  options: UploadOptions = {},
): Promise<request.Response> {
  const presign = await agent.post('/media/presign').send({
    filename: 'tep-tai-len',
    mimeType: options.declaredMime ?? mimeType,
    size: options.declaredSize ?? buffer.length,
  });
  if (presign.status !== 201) throw new Error(`presign trả ${presign.status}: ${JSON.stringify(presign.body)}`);
  const { id, uploadUrl, headers } = presign.body as { id: string; uploadUrl: string; headers: Record<string, string> };
  const put = request(app.getHttpServer()).put(uploadUrl).set(headers);
  if (options.putContentType) put.set('Content-Type', options.putContentType);
  await put.send(buffer).expect(204);
  const done = await agent.post(`/media/${id}/complete`);
  if (done.status !== 200) throw new Error(`complete trả ${done.status}: ${JSON.stringify(done.body)}`);
  return done;
}
