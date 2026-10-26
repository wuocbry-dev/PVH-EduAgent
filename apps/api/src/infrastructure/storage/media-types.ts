import { randomUUID } from 'node:crypto';
import type { MediaKind } from '@pvh/shared';

export interface MediaType {
  mime: string;
  ext: string;
  kind: MediaKind;
  matches: (buf: Buffer) => boolean;
}

// Số byte đầu của file đủ để nhận dạng mọi loại bên dưới.
export const SNIFF_BYTES = 512;

const MP4_BRAND = /^(isom|iso[2-9]|mp4[12]|avc1|dash|MSNV|M4V |f4v )/;

// Nhận dạng theo nội dung file (magic bytes), không tin đuôi file hay Content-Type do client gửi.
// Không nhận SVG vì có thể chứa script; MOV/HEIC cũng dùng khung `ftyp` nên chỉ nhận các brand của MP4.
export const MEDIA_TYPES: MediaType[] = [
  { mime: 'image/jpeg', ext: 'jpg', kind: 'IMAGE', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    ext: 'png',
    kind: 'IMAGE',
    matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    kind: 'IMAGE',
    matches: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    kind: 'IMAGE',
    matches: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    mime: 'video/mp4',
    ext: 'mp4',
    kind: 'VIDEO',
    matches: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && MP4_BRAND.test(b.subarray(8, 12).toString('latin1')),
  },
  {
    // EBML + DocType "webm" (loại bỏ Matroska .mkv dùng chung khung EBML).
    mime: 'video/webm',
    ext: 'webm',
    kind: 'VIDEO',
    matches: (b) =>
      b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(0, 64).toString('latin1').includes('webm'),
  },
];

export const detectMediaType = (head: Buffer): MediaType | undefined => MEDIA_TYPES.find((t) => t.matches(head));

export const mediaTypeByMime = (mime: string): MediaType | undefined => MEDIA_TYPES.find((t) => t.mime === mime);

export const mediaTypeByExt = (ext: string): MediaType | undefined => MEDIA_TYPES.find((t) => t.ext === ext);

// Khoá object: UUID ngẫu nhiên + đuôi theo loại, không bao giờ dùng tên file của người dùng.
export const newStorageKey = (type: MediaType): string => `${randomUUID()}.${type.ext}`;

export const STORAGE_KEY = new RegExp(`^[0-9a-f-]{36}\\.(${MEDIA_TYPES.map((t) => t.ext).join('|')})$`);

// Loại media suy ra từ khoá (đuôi); null nếu không phải khoá hợp lệ.
export function kindOfKey(key: string): MediaKind | null {
  if (!STORAGE_KEY.test(key)) return null;
  return mediaTypeByExt(key.slice(key.lastIndexOf('.') + 1))?.kind ?? null;
}
