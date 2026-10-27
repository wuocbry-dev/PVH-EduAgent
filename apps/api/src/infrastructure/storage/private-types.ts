import { randomUUID } from 'node:crypto';
import type { LibraryKind } from '@pvh/shared';

export interface PrivateFileType {
  mime: string;
  ext: string;
  kind: LibraryKind;
  matches: (buf: Buffer) => boolean;
}

const MP4_BRAND = /^(isom|iso[2-9]|mp4[12]|avc1|dash|MSNV|M4V |f4v )/;

// Loại file của kho riêng tư (thư viện số), nhận dạng theo nội dung (magic bytes), không tin đuôi file hay Content-Type.
export const PRIVATE_FILE_TYPES: PrivateFileType[] = [
  { mime: 'application/pdf', ext: 'pdf', kind: 'PDF', matches: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  {
    // Thẻ ID3v2 ở đầu, hoặc khung MPEG-1/2 Layer III (11 bit đồng bộ + layer = 01).
    mime: 'audio/mpeg',
    ext: 'mp3',
    kind: 'AUDIO',
    matches: (b) => b.subarray(0, 3).toString('latin1') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe6) === 0xe2),
  },
  {
    mime: 'video/mp4',
    ext: 'mp4',
    kind: 'VIDEO',
    matches: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && MP4_BRAND.test(b.subarray(8, 12).toString('latin1')),
  },
  {
    mime: 'video/webm',
    ext: 'webm',
    kind: 'VIDEO',
    matches: (b) =>
      b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 && b.subarray(0, 64).toString('latin1').includes('webm'),
  },
];

export const detectPrivateType = (head: Buffer): PrivateFileType | undefined => PRIVATE_FILE_TYPES.find((t) => t.matches(head));

export const privateTypeByMime = (mime: string): PrivateFileType | undefined => PRIVATE_FILE_TYPES.find((t) => t.mime === mime);

// Khoá object trong kho riêng tư: tiền tố riêng + UUID + đuôi, không dùng tên file của người dùng.
export const newPrivateKey = (type: PrivateFileType): string => `lib-${randomUUID()}.${type.ext}`;

export const PRIVATE_KEY = new RegExp(`^lib-[0-9a-f-]{36}\\.(${PRIVATE_FILE_TYPES.map((t) => t.ext).join('|')})$`);
