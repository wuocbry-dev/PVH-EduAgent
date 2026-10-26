import type { Readable } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  mediaMaxBytes,
  type MediaDto,
  type MediaKind,
  type MediaPresignDto,
} from '@pvh/shared';
import { assertPermission, can } from '../../common/guards/permission.js';
import { parseId } from '../../common/utils/parse-id.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import type { Media } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import {
  detectMediaType,
  mediaTypeByMime,
  newStorageKey,
  SNIFF_BYTES,
  STORAGE_KEY,
} from '../../infrastructure/storage/media-types.js';
import { LocalStorageService } from '../../infrastructure/storage/local-storage.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import { AuditLogService, type AuditChannel } from '../audit-log/audit-log.service.js';
import type { PresignInput } from './dto/media.dto.js';

const MAX_LIST = 60;
// Mỗi người chỉ được giữ tối đa ngần này yêu cầu tải lên chưa hoàn tất (chống tạo bản ghi rác).
const MAX_PENDING_PER_USER = 20;
// Bản ghi chờ quá thời gian này mà chưa hoàn tất thì bị dọn.
export const PENDING_TTL_MS = 60 * 60 * 1000;

export interface ActionMeta {
  ip?: string;
  channel?: AuditChannel;
}

// Bài còn giữ liên kết tới media nên không cho xoá file.
const PROTECTED_POST_STATUSES = ['PUBLISHED', 'SCHEDULED'] as const;

// F13 – ảnh và video. Mọi file đi qua StorageService (R2 hoặc local); server không bao giờ tin Content-Type
// do client gửi: loại thật được nhận dạng bằng magic bytes ở bước hoàn tất.
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly storage: StorageService,
  ) {}

  // Bước 1 của luồng tải lên: tạo bản ghi chờ + URL ký sẵn để trình duyệt PUT thẳng lên kho.
  async presign(user: AuthUser, input: PresignInput, meta: ActionMeta = {}): Promise<MediaPresignDto> {
    assertPermission(user, 'post:create');
    const type = mediaTypeByMime(input.mimeType);
    if (!type) {
      throw new BadRequestException('Chỉ chấp nhận ảnh JPEG, PNG, WebP, GIF hoặc video MP4, WebM');
    }
    this.assertSize(type.kind, input.size);

    const pending = await this.prisma.media.count({
      where: { uploadedBy: BigInt(user.id), status: 'PENDING' },
    });
    if (pending >= MAX_PENDING_PER_USER) {
      throw new ConflictException('Có quá nhiều file đang tải lên dở dang, vui lòng thử lại sau ít phút');
    }

    const key = newStorageKey(type);
    const media = await this.prisma.media.create({
      data: {
        url: this.storage.publicUrl(key),
        storageKey: key,
        status: 'PENDING',
        kind: type.kind,
        mimeType: type.mime,
        size: input.size,
        uploadedBy: BigInt(user.id),
      },
    });
    const upload = await this.storage.presignPut({
      id: media.id.toString(),
      key,
      mimeType: type.mime,
      size: input.size,
    });
    await this.record(user, 'media.presign', media, meta, { kind: media.kind, mimeType: media.mimeType, size: media.size });
    return {
      id: media.id.toString(),
      uploadUrl: upload.uploadUrl,
      headers: upload.headers,
      expiresAt: upload.expiresAt.toISOString(),
    };
  }

  // Driver local: nhận PUT file từ trình duyệt tại uploadUrl của presign. Xác thực bằng token HMAC (id + khoá + MIME +
  // kích thước, hết hạn 10 phút), không cần đăng nhập. Driver r2 không có endpoint này (trình duyệt PUT thẳng lên R2).
  async receiveLocalUpload(id: string, token: string, contentType: string | undefined, body: Readable): Promise<void> {
    if (!(this.storage instanceof LocalStorageService)) throw new NotFoundException('Không tìm thấy');
    const claims = this.storage.verifyToken(token);
    if (!claims || claims.id !== id) throw new ForbiddenException('Liên kết tải lên không hợp lệ hoặc đã hết hạn');
    if (contentType?.split(';')[0].trim().toLowerCase() !== claims.mimeType) {
      throw new BadRequestException('Content-Type không khớp với khai báo');
    }
    const media = await this.prisma.media.findFirst({
      where: { id: parseId(id), storageKey: claims.key, status: 'PENDING' },
    });
    if (!media) throw new NotFoundException('Không tìm thấy yêu cầu tải lên');

    // Đọc đúng `size` byte đã khai báo; nhiều hơn thì dừng ngay (không đệm cả file lớn vào bộ nhớ).
    // Không dùng `for await` vì thoát sớm sẽ huỷ socket trước khi kịp trả lỗi 413 cho client.
    const chunks: Buffer[] = [];
    let received = 0;
    await new Promise<void>((done, fail) => {
      body.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > claims.size) {
          body.removeAllListeners('data');
          body.pause();
          fail(new PayloadTooLargeException('File lớn hơn kích thước đã khai báo'));
          return;
        }
        chunks.push(chunk);
      });
      body.on('end', done);
      body.on('error', fail);
    });
    if (received !== claims.size) throw new BadRequestException('File nhỏ hơn kích thước đã khai báo');
    await this.storage.putObject(claims.key, Buffer.concat(chunks), claims.mimeType);
  }

  // Bước 3: kiểm tra object thật sự có trên kho, đúng kích thước và đúng loại (magic bytes). Sai thì xoá object + bản ghi.
  async complete(user: AuthUser, id: string, meta: ActionMeta = {}): Promise<MediaDto> {
    assertPermission(user, 'post:create');
    const media = await this.ownedOrThrow(user, id);
    if (media.status === 'READY') return toMediaDto(media);

    const reject = async (message: string, reason: string): Promise<never> => {
      await this.discard(media);
      await this.record(user, 'media.reject', media, meta, { reason }, false);
      throw new BadRequestException(message);
    };

    const head = await this.storage.head(media.storageKey);
    if (!head) {
      // Chưa tải lên: giữ bản ghi chờ để người dùng thử lại trong thời hạn URL.
      throw new BadRequestException('Chưa thấy file được tải lên');
    }
    if (head.size !== media.size) {
      return reject('Kích thước file không khớp với khai báo', 'size_mismatch');
    }
    const bytes = await this.storage.readHead(media.storageKey, SNIFF_BYTES);
    const detected = bytes ? detectMediaType(bytes) : undefined;
    if (!detected || detected.mime !== media.mimeType) {
      return reject('Nội dung file không đúng loại ảnh/video đã chọn', 'content_mismatch');
    }

    const { count } = await this.prisma.media.updateMany({
      where: { id: media.id, status: 'PENDING' },
      data: { status: 'READY' },
    });
    const ready = await this.prisma.media.findUniqueOrThrow({ where: { id: media.id } });
    if (count === 1) {
      await this.record(user, 'media.upload', ready, meta, {
        url: ready.url,
        kind: ready.kind,
        mimeType: ready.mimeType,
        size: ready.size,
      });
    }
    return toMediaDto(ready);
  }

  // Tạo bản ghi từ dữ liệu phía server (vd. bot Telegram nhận ảnh): tự nhận dạng loại, kiểm tra dung lượng, tải lên kho.
  async createFromBuffer(
    user: AuthUser,
    buffer: Buffer,
    meta: ActionMeta = {},
  ): Promise<MediaDto> {
    assertPermission(user, 'post:create');
    const type = detectMediaType(buffer.subarray(0, SNIFF_BYTES));
    if (!type) {
      throw new UnsupportedMediaTypeException('Chỉ chấp nhận ảnh JPEG, PNG, WebP, GIF hoặc video MP4, WebM');
    }
    this.assertSize(type.kind, buffer.length);

    const key = newStorageKey(type);
    await this.storage.putObject(key, buffer, type.mime);
    let media: Media;
    try {
      media = await this.prisma.media.create({
        data: {
          url: this.storage.publicUrl(key),
          storageKey: key,
          status: 'READY',
          kind: type.kind,
          mimeType: type.mime,
          size: buffer.length,
          uploadedBy: BigInt(user.id),
        },
      });
    } catch (err) {
      await this.storage.delete(key).catch(() => undefined);
      throw err;
    }
    await this.record(user, 'media.upload', media, meta, {
      url: media.url,
      kind: media.kind,
      mimeType: media.mimeType,
      size: media.size,
    });
    return toMediaDto(media);
  }

  // Người có post:approve thấy mọi file; người còn lại chỉ thấy file mình tải lên. Chỉ file đã hoàn tất.
  async list(user: AuthUser, kind?: MediaKind): Promise<MediaDto[]> {
    assertPermission(user, 'post:create');
    const items = await this.prisma.media.findMany({
      where: {
        status: 'READY',
        ...(kind ? { kind } : {}),
        ...(can(user, 'post:approve') ? {} : { uploadedBy: BigInt(user.id) }),
      },
      orderBy: { id: 'desc' },
      take: MAX_LIST,
    });
    return items.map(toMediaDto);
  }

  // Xoá bản ghi và object; từ chối nếu file đang được bài đã đăng/hẹn giờ dùng (báo rõ bài nào).
  async remove(user: AuthUser, id: string, meta: ActionMeta = {}): Promise<void> {
    assertPermission(user, 'post:create');
    const media = await this.ownedOrThrow(user, id);

    const using = await this.prisma.post.findMany({
      where: {
        status: { in: [...PROTECTED_POST_STATUSES] },
        OR: [{ thumbnailUrl: media.url }, { content: { contains: media.storageKey } }],
      },
      select: { title: true },
      take: 5,
    });
    if (using.length > 0) {
      throw new ConflictException(
        `File đang được dùng trong bài đã đăng: ${using.map((p) => `"${p.title}"`).join(', ')}`,
      );
    }

    await this.storage.delete(media.storageKey);
    await this.prisma.media.delete({ where: { id: media.id } });
    await this.record(user, 'media.delete', media, meta, { url: media.url, kind: media.kind });
  }

  // File để phục vụ công khai (driver local). Chỉ file đã hoàn tất kiểm tra; tên phải đúng định dạng khoá đã sinh.
  async resolveFile(name: string): Promise<{ root: string; name: string; mime: string }> {
    if (!(this.storage instanceof LocalStorageService) || !STORAGE_KEY.test(name)) {
      throw new NotFoundException('Không tìm thấy file');
    }
    const media = await this.prisma.media.findFirst({
      where: { storageKey: name, status: 'READY' },
      select: { mimeType: true },
    });
    if (!media) throw new NotFoundException('Không tìm thấy file');
    return { root: this.storage.dir, name, mime: media.mimeType };
  }

  // Job định kỳ: xoá bản ghi chờ quá 1 giờ chưa hoàn tất cùng object mồ côi. Trả số bản ghi đã dọn.
  async cleanupStale(now = new Date()): Promise<number> {
    const stale = await this.prisma.media.findMany({
      where: { status: 'PENDING', createdAt: { lt: new Date(now.getTime() - PENDING_TTL_MS) } },
      take: 200,
    });
    let cleaned = 0;
    for (const media of stale) {
      try {
        await this.discard(media);
        cleaned++;
        await this.audit.record({
          userId: null,
          channel: 'scheduler',
          action: 'media.cleanup',
          targetType: 'media',
          targetId: media.id.toString(),
          params: { kind: media.kind, size: media.size },
          ok: true,
        });
      } catch (err) {
        this.logger.error(`Không dọn được media ${media.id}: ${String(err)}`);
      }
    }
    return cleaned;
  }

  private assertSize(kind: MediaKind, size: number): void {
    const max = mediaMaxBytes(kind);
    if (size > max) {
      throw new PayloadTooLargeException(
        `${kind === 'IMAGE' ? 'Ảnh' : 'Video'} vượt quá ${max / 1024 / 1024} MB`,
      );
    }
  }

  // Người tạo hoặc người có post:approve; người khác nhận 404 như thể file không tồn tại.
  private async ownedOrThrow(user: AuthUser, id: string): Promise<Media> {
    const media = await this.prisma.media.findUnique({ where: { id: parseId(id) } });
    if (!media || (media.uploadedBy !== BigInt(user.id) && !can(user, 'post:approve'))) {
      throw new NotFoundException('Không tìm thấy file');
    }
    return media;
  }

  private async discard(media: Media): Promise<void> {
    await this.storage.delete(media.storageKey);
    await this.prisma.media.deleteMany({ where: { id: media.id } });
  }

  private record(
    user: AuthUser,
    action: string,
    media: Media,
    meta: ActionMeta,
    params: Record<string, unknown>,
    ok = true,
  ) {
    return this.audit.record({
      userId: user.id,
      channel: meta.channel ?? 'web',
      action,
      targetType: 'media',
      targetId: media.id.toString(),
      params,
      ok,
      ip: meta.ip,
    });
  }
}

export function toMediaDto(media: Media): MediaDto {
  return {
    id: media.id.toString(),
    url: media.url,
    kind: media.kind,
    mimeType: media.mimeType,
    size: media.size,
    uploadedBy: media.uploadedBy.toString(),
  };
}

