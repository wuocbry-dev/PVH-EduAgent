import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MEDIA_MAX_BYTES, type MediaDto } from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Env } from '../../config/env.validation.js';
import type { Media } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';

// Phần của file do multer (bộ nhớ đệm) cung cấp mà service dùng tới.
export interface UploadedImage {
  buffer: Buffer;
  size: number;
  mimetype: string;
}

const FILE_NAME = /^[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;
const MAX_LIST = 60;

interface ImageType {
  mime: string;
  ext: string;
  matches: (buf: Buffer) => boolean;
}

// Nhận dạng theo nội dung file (magic bytes), không tin đuôi file hay Content-Type do client gửi.
// Không nhận SVG vì có thể chứa script.
const IMAGE_TYPES: ImageType[] = [
  {
    mime: 'image/jpeg',
    ext: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/png',
    ext: 'png',
    matches: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mime: 'image/gif',
    ext: 'gif',
    matches: (b) => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')),
  },
  {
    mime: 'image/webp',
    ext: 'webp',
    matches: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

export const MIME_BY_EXT: Record<string, string> = Object.fromEntries(
  IMAGE_TYPES.map((t) => [t.ext, t.mime]),
);

// F13 – tải ảnh lên thư mục uploads/ và lưu bảng media.
@Injectable()
export class MediaService {
  private readonly dir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    config: ConfigService<Env, true>,
  ) {
    this.dir = resolve(process.cwd(), config.get('UPLOAD_DIR', { infer: true }));
  }

  async upload(
    user: AuthUser,
    file: UploadedImage | undefined,
    ip?: string,
  ): Promise<MediaDto> {
    assertPermission(user, 'post:create');
    if (!file) throw new BadRequestException('Chưa chọn file để tải lên');
    if (file.size > MEDIA_MAX_BYTES) {
      throw new PayloadTooLargeException(
        `Ảnh vượt quá ${MEDIA_MAX_BYTES / 1024 / 1024} MB`,
      );
    }
    const type = IMAGE_TYPES.find((t) => t.matches(file.buffer));
    if (!type || type.mime !== file.mimetype) {
      throw new BadRequestException(
        'Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc GIF',
      );
    }

    const name = `${randomUUID()}.${type.ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(resolve(this.dir, name), file.buffer);
    const media = await this.prisma.media.create({
      data: {
        url: `/media/files/${name}`,
        mimeType: type.mime,
        size: file.size,
        uploadedBy: BigInt(user.id),
      },
    });
    await this.audit.record({
      userId: user.id,
      channel: 'web',
      action: 'media.upload',
      targetType: 'media',
      targetId: media.id.toString(),
      params: { url: media.url, mimeType: media.mimeType, size: media.size },
      ok: true,
      ip,
    });
    return toMediaDto(media);
  }

  // Người có post:approve thấy mọi ảnh; người còn lại chỉ thấy ảnh mình tải lên.
  async list(user: AuthUser): Promise<MediaDto[]> {
    assertPermission(user, 'post:create');
    const items = await this.prisma.media.findMany({
      where: can(user, 'post:approve') ? {} : { uploadedBy: BigInt(user.id) },
      orderBy: { id: 'desc' },
      take: MAX_LIST,
    });
    return items.map(toMediaDto);
  }

  // Đường dẫn file để phục vụ công khai; tên file phải đúng định dạng đã sinh khi tải lên (chặn ../).
  resolveFile(name: string): { root: string; name: string; mime: string } {
    if (!FILE_NAME.test(name)) throw new NotFoundException('Không tìm thấy ảnh');
    return {
      root: this.dir,
      name,
      mime: MIME_BY_EXT[name.slice(name.lastIndexOf('.') + 1)],
    };
  }
}

function toMediaDto(media: Media): MediaDto {
  return {
    id: media.id.toString(),
    url: media.url,
    mimeType: media.mimeType,
    size: media.size,
    uploadedBy: media.uploadedBy.toString(),
  };
}
