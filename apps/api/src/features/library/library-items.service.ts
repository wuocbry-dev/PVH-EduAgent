import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  LIBRARY_MAX_BYTES,
  LIBRARY_MIME_TYPES,
  LIBRARY_STATUS_NAMES,
  LIBRARY_SUBMIT_PER_HOUR,
  MEDIA_IMAGE_MIME_TYPES,
  normalizeSearch,
  type LibraryCategoryDto,
  type LibraryFormOptionsDto,
  type LibraryItemDto,
  type LibraryStatus,
  type LibraryUploadDto,
} from '@pvh/shared';
import type { Request, Response } from 'express';
import { assertPermission, can } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../common/utils/prisma-errors.js';
import { readLimitedBody } from '../../common/utils/read-limited-body.js';
import { slugify } from '../../common/utils/slugify.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { RevalidateService } from '../../infrastructure/revalidate/revalidate.service.js';
import { LocalPrivateStorageService } from '../../infrastructure/storage/local-private-storage.service.js';
import { SNIFF_BYTES } from '../../infrastructure/storage/media-types.js';
import { PrivateStorageService } from '../../infrastructure/storage/private-storage.service.js';
import { detectPrivateType, newPrivateKey, privateTypeByMime } from '../../infrastructure/storage/private-types.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { MediaService } from '../media/media.service.js';
import type {
  CategoryInput,
  CompleteUploadInput,
  CreateItemInput,
  ReviewInput,
  SubmissionsQuery,
  UpdateItemInput,
  UploadInput,
} from './dto/library.dto.js';
import { ITEM_INCLUDE, toItem, type ItemRow } from './library-mappers.js';

// Trạng thái mà người gửi còn tự sửa/xoá/tải file được (đang chờ duyệt hay đã đăng thì chỉ người quản lý sửa).
const OWNER_EDITABLE: LibraryStatus[] = ['DRAFT', 'REJECTED'];

const canSubmitOrManage = (user: AuthUser) => {
  if (!can(user, 'library:submit') && !can(user, 'library:manage')) assertPermission(user, 'library:submit');
};

// Thư viện số – phía người gửi và người quản lý (bước 21): soạn tài liệu, tải file vào kho riêng tư, gửi duyệt,
// duyệt/từ chối/ẩn (library:manage), danh mục. Mọi thao tác ghi audit `library.*` (không bao giờ ghi URL ký sẵn).
@Injectable()
export class LibraryItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
    private readonly revalidate: RevalidateService,
    private readonly files: PrivateStorageService,
    private readonly media: MediaService,
  ) {}

  async formOptions(user: AuthUser): Promise<LibraryFormOptionsDto> {
    canSubmitOrManage(user);
    const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
    const [categories, subjects, classes] = await Promise.all([
      this.prisma.libraryCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.subject.findMany({ orderBy: { name: 'asc' } }),
      year
        ? this.prisma.schoolClass.findMany({ where: { schoolYearId: year.id }, include: { grade: true }, orderBy: { name: 'asc' } })
        : Promise.resolve([]),
    ]);
    return {
      categories: categories.map((c) => ({ id: c.id.toString(), name: c.name, parentId: c.parentId?.toString() ?? null })),
      subjects: subjects.map((s) => ({ id: s.id.toString(), name: s.name })),
      grades: [10, 11, 12],
      classes: classes.map((c) => ({ id: c.id.toString(), name: c.name, gradeLevel: c.grade.level })),
      canManage: can(user, 'library:manage'),
    };
  }

  // Tài liệu tôi gửi (mọi trạng thái); người quản lý xem được tất cả (hàng chờ duyệt: status=PENDING_REVIEW).
  async submissions(user: AuthUser, query: SubmissionsQuery): Promise<LibraryItemDto[]> {
    canSubmitOrManage(user);
    if (query.scope === 'all') assertPermission(user, 'library:manage');
    const and: Prisma.LibraryItemWhereInput[] = [];
    if (query.scope === 'mine') and.push({ submittedBy: BigInt(user.id) });
    if (query.status) and.push({ status: query.status });
    for (const word of normalizeSearch(query.q ?? '').split(' ').filter(Boolean).slice(0, 8)) and.push({ searchText: { contains: word } });
    const rows = await this.prisma.libraryItem.findMany({
      where: { AND: and },
      include: ITEM_INCLUDE,
      // Hàng chờ duyệt: gửi trước duyệt trước.
      orderBy: query.status === 'PENDING_REVIEW' ? [{ updatedAt: 'asc' }] : [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: 200,
    });
    return rows.map(toItem);
  }

  async get(user: AuthUser, id: string): Promise<LibraryItemDto> {
    canSubmitOrManage(user);
    return toItem(await this.ownedOrManaged(user, id));
  }

  async create(user: AuthUser, input: CreateItemInput, ip?: string): Promise<LibraryItemDto> {
    canSubmitOrManage(user);
    const { count, retryAfterSec } = await this.limits.increment('library-submit', user.id, 3600);
    if (count > LIBRARY_SUBMIT_PER_HOUR) {
      throw new HttpException(`Bạn tạo quá nhiều tài liệu, vui lòng thử lại sau ${Math.ceil(retryAfterSec / 60)} phút`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const data = await this.fields(input);
    const row = await this.prisma.libraryItem.create({
      data: {
        ...data.scalars,
        kind: input.kind,
        slug: await this.uniqueSlug(input.title),
        submittedBy: BigInt(user.id),
        classes: { create: data.classIds.map((classId) => ({ classId })) },
      },
      include: ITEM_INCLUDE,
    });
    await this.record(user, 'library.create', row, ip);
    return toItem(row);
  }

  async update(user: AuthUser, id: string, input: UpdateItemInput, ip?: string): Promise<LibraryItemDto> {
    const row = await this.editable(user, id);
    if (input.kind !== row.kind && row.fileKey) throw new BadRequestException('Đã có file thì không đổi được loại tài liệu');
    const data = await this.fields(input);
    const updated = await this.prisma.libraryItem.update({
      where: { id: row.id },
      data: {
        ...data.scalars,
        kind: input.kind,
        classes: { deleteMany: {}, create: data.classIds.map((classId) => ({ classId })) },
      },
      include: ITEM_INCLUDE,
    });
    await this.record(user, 'library.update', updated, ip);
    if (updated.status === 'PUBLISHED') await this.revalidate.revalidate('library');
    return toItem(updated);
  }

  async remove(user: AuthUser, id: string, ip?: string): Promise<void> {
    const row = await this.editable(user, id);
    await this.prisma.libraryItem.delete({ where: { id: row.id } });
    for (const key of [row.fileKey, row.pendingKey]) if (key) await this.files.delete(key).catch(() => undefined);
    await this.record(user, 'library.delete', row, ip);
    if (row.status === 'PUBLISHED') await this.revalidate.revalidate('library');
  }

  // Bước 1 của luồng tải lên. File tài liệu: URL ký sẵn để PUT thẳng vào kho riêng tư. Ảnh bìa: luồng media của bước 11.
  async presign(user: AuthUser, id: string, input: UploadInput, ip?: string): Promise<LibraryUploadDto & { uploadId: string }> {
    const row = await this.editable(user, id);
    if (input.target === 'cover') {
      const mimeType = MEDIA_IMAGE_MIME_TYPES.find((m) => m === input.mimeType);
      if (!mimeType) throw new BadRequestException('Ảnh bìa phải là JPEG, PNG, WebP hoặc GIF');
      const media = await this.media.presign(user, { filename: 'bia', mimeType, size: input.size }, { ip }, canSubmitOrManage);
      return { uploadId: media.id, uploadUrl: media.uploadUrl, headers: media.headers, expiresAt: media.expiresAt };
    }

    const type = privateTypeByMime(input.mimeType);
    if (!type || !LIBRARY_MIME_TYPES[row.kind].includes(type.mime)) {
      throw new BadRequestException(
        row.kind === 'PDF' ? 'Tài liệu này cần file PDF' : row.kind === 'AUDIO' ? 'Sách nói cần file MP3' : 'Video cần file MP4 hoặc WebM',
      );
    }
    if (input.size > LIBRARY_MAX_BYTES[row.kind]) {
      throw new BadRequestException(`File quá lớn (tối đa ${LIBRARY_MAX_BYTES[row.kind] / 1024 / 1024} MB)`);
    }
    // Lần tải trước còn dở thì bỏ object cũ.
    if (row.pendingKey) await this.files.delete(row.pendingKey).catch(() => undefined);
    const key = newPrivateKey(type);
    await this.prisma.libraryItem.update({
      where: { id: row.id },
      data: { pendingKey: key, pendingMime: type.mime, pendingSize: input.size },
    });
    const upload = await this.files.presignPut({ id: row.id.toString(), key, mimeType: type.mime, size: input.size });
    return { uploadId: row.id.toString(), uploadUrl: upload.uploadUrl, headers: upload.headers, expiresAt: upload.expiresAt.toISOString() };
  }

  // Driver local: nhận PUT file tại uploadUrl (token HMAC thay cho chữ ký R2, không cần đăng nhập).
  async receiveLocalUpload(id: string, token: string, req: Request, res: Response): Promise<void> {
    if (!(this.files instanceof LocalPrivateStorageService)) throw new NotFoundException('Không tìm thấy');
    const claims = this.files.verifyToken(token, 'put');
    if (!claims || claims.id !== id || !claims.size) throw new ForbiddenException('Liên kết tải lên không hợp lệ hoặc đã hết hạn');
    if (req.get('content-type')?.split(';')[0].trim().toLowerCase() !== claims.mimeType) {
      throw new BadRequestException('Content-Type không khớp với khai báo');
    }
    const row = await this.prisma.libraryItem.findFirst({ where: { id: parseId(id), pendingKey: claims.key } });
    if (!row) throw new NotFoundException('Không tìm thấy yêu cầu tải lên');
    const body = await readLimitedBody(req, res, claims.size);
    if (body.length !== claims.size) throw new BadRequestException('File nhỏ hơn kích thước đã khai báo');
    await this.files.putObject(claims.key, body);
  }

  // Bước 3: kiểm tra object có thật, đúng kích thước, đúng loại (magic bytes). Sai thì xoá object.
  async complete(user: AuthUser, id: string, input: CompleteUploadInput, ip?: string): Promise<LibraryItemDto> {
    const row = await this.editable(user, id);
    if (input.target === 'cover') {
      if (!input.uploadId) throw new BadRequestException('Thiếu mã ảnh bìa');
      const media = await this.media.complete(user, input.uploadId, { ip }, canSubmitOrManage);
      if (media.kind !== 'IMAGE') throw new BadRequestException('Ảnh bìa phải là ảnh');
      const updated = await this.prisma.libraryItem.update({ where: { id: row.id }, data: { coverUrl: media.url }, include: ITEM_INCLUDE });
      if (updated.status === 'PUBLISHED') await this.revalidate.revalidate('library');
      return toItem(updated);
    }

    if (!row.pendingKey || !row.pendingMime || !row.pendingSize) throw new BadRequestException('Chưa có yêu cầu tải file');
    const key = row.pendingKey;
    const reject = async (message: string, reason: string): Promise<never> => {
      await this.files.delete(key).catch(() => undefined);
      await this.prisma.libraryItem.update({ where: { id: row.id }, data: { pendingKey: null, pendingMime: null, pendingSize: null } });
      await this.record(user, 'library.file_reject', row, ip, { reason }, false);
      throw new BadRequestException(message);
    };
    const head = await this.files.head(key);
    if (!head) throw new BadRequestException('Chưa thấy file được tải lên');
    if (head.size !== row.pendingSize) return reject('Kích thước file không khớp với khai báo', 'size_mismatch');
    const bytes = await this.files.readHead(key, SNIFF_BYTES);
    const detected = bytes ? detectPrivateType(bytes) : undefined;
    if (!detected || detected.mime !== row.pendingMime || detected.kind !== row.kind) {
      return reject('Nội dung file không đúng loại đã chọn (PDF, MP3, MP4 hoặc WebM)', 'content_mismatch');
    }
    const { count } = await this.prisma.libraryItem.updateMany({
      where: { id: row.id, pendingKey: key },
      data: { fileKey: key, fileMime: detected.mime, fileSize: head.size, pendingKey: null, pendingMime: null, pendingSize: null },
    });
    if (count === 1 && row.fileKey) await this.files.delete(row.fileKey).catch(() => undefined);
    const updated = await this.prisma.libraryItem.findUniqueOrThrow({ where: { id: row.id }, include: ITEM_INCLUDE });
    if (count === 1) await this.record(user, 'library.file_upload', updated, ip, { mimeType: detected.mime, size: head.size });
    return toItem(updated);
  }

  // Gửi duyệt: chỉ người gửi, từ nháp/bị từ chối, phải có file.
  async submit(user: AuthUser, id: string, ip?: string): Promise<LibraryItemDto> {
    const row = await this.editable(user, id);
    if (row.submittedBy.toString() !== user.id) throw new ForbiddenException('Chỉ người soạn mới gửi duyệt được');
    if (!row.fileKey) throw new BadRequestException('Chưa tải file tài liệu lên');
    const updated = await this.transition(row, ['DRAFT', 'REJECTED'], { status: 'PENDING_REVIEW', rejectReason: null });
    await this.record(user, 'library.submit', updated, ip);
    return toItem(updated);
  }

  // Duyệt đăng / từ chối (kèm lý do) / ẩn / hiện lại – chỉ thủ thư và BGH.
  async review(user: AuthUser, id: string, input: ReviewInput, ip?: string): Promise<LibraryItemDto> {
    assertPermission(user, 'library:manage');
    const row = await this.find(id);
    const reviewer = { reviewedBy: BigInt(user.id), reviewedAt: new Date() };
    let updated: ItemRow;
    switch (input.action) {
      case 'approve':
        if (!row.fileKey) throw new BadRequestException('Tài liệu chưa có file');
        updated = await this.transition(row, ['PENDING_REVIEW'], { status: 'PUBLISHED', publishedAt: row.publishedAt ?? new Date(), rejectReason: null, ...reviewer });
        break;
      case 'reject':
        if (!input.reason || input.reason.length < 3) throw new BadRequestException('Cần ghi lý do từ chối');
        updated = await this.transition(row, ['PENDING_REVIEW'], { status: 'REJECTED', rejectReason: input.reason, ...reviewer });
        break;
      case 'archive':
        updated = await this.transition(row, ['PUBLISHED'], { status: 'ARCHIVED', ...reviewer });
        break;
      case 'restore':
        updated = await this.transition(row, ['ARCHIVED'], { status: 'PUBLISHED', ...reviewer });
        break;
    }
    await this.record(user, `library.${input.action}`, updated, ip, input.reason ? { reason: input.reason } : {});
    if (input.action !== 'reject') await this.revalidate.revalidate('library');
    if ((input.action === 'approve' || input.action === 'reject') && row.submittedBy.toString() !== user.id) {
      await this.prisma.notification.create({
        data: {
          userId: row.submittedBy,
          channel: 'web',
          title: input.action === 'approve' ? 'Tài liệu đã được duyệt' : 'Tài liệu bị từ chối',
          body:
            input.action === 'approve'
              ? `Tài liệu "${row.title}" đã được đăng lên thư viện số.`
              : `Tài liệu "${row.title}" chưa được duyệt. Lý do: ${input.reason}`,
        },
      });
    }
    return toItem(updated);
  }

  // ── Danh mục ──

  async categories(user: AuthUser): Promise<LibraryCategoryDto[]> {
    assertPermission(user, 'library:manage');
    const [rows, counts] = await Promise.all([
      this.prisma.libraryCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.libraryItem.groupBy({ by: ['categoryId'], _count: { _all: true } }),
    ]);
    const countOf = new Map(counts.map((c) => [c.categoryId.toString(), c._count._all]));
    return rows.map((c) => ({
      id: c.id.toString(),
      name: c.name,
      slug: c.slug,
      parentId: c.parentId?.toString() ?? null,
      sortOrder: c.sortOrder,
      itemCount: countOf.get(c.id.toString()) ?? 0,
    }));
  }

  async saveCategory(user: AuthUser, id: string | null, input: CategoryInput, ip?: string): Promise<void> {
    assertPermission(user, 'library:manage');
    const parentId = input.parentId ? BigInt(input.parentId) : null;
    const categoryId = id ? parseId(id) : null;
    if (parentId) {
      const parent = await this.prisma.libraryCategory.findUnique({ where: { id: parentId } });
      if (!parent) throw new BadRequestException('Danh mục cha không tồn tại');
      // Cây chỉ hai cấp: tránh vòng lặp và giữ menu đơn giản.
      if (parent.parentId || parentId === categoryId) throw new BadRequestException('Danh mục chỉ có tối đa hai cấp');
      if (categoryId && (await this.prisma.libraryCategory.count({ where: { parentId: categoryId } }))) {
        throw new BadRequestException('Danh mục đang có danh mục con nên không đặt làm danh mục con được');
      }
    }
    const data = { name: input.name, slug: input.slug || slugify(input.name) || 'danh-muc', parentId, sortOrder: input.sortOrder };
    try {
      const row = categoryId
        ? await this.prisma.libraryCategory.update({ where: { id: categoryId }, data })
        : await this.prisma.libraryCategory.create({ data });
      await this.audit.record({
        userId: user.id,
        channel: 'web',
        action: categoryId ? 'library.category_update' : 'library.category_create',
        targetType: 'library_category',
        targetId: row.id.toString(),
        params: { name: row.name, slug: row.slug },
        ok: true,
        ip,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Đường dẫn danh mục đã có, hãy đặt đường dẫn khác');
      if ((err as { code?: string }).code === 'P2025') throw new NotFoundException('Không tìm thấy danh mục');
      throw err;
    }
    await this.revalidate.revalidate('library');
  }

  async removeCategory(user: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(user, 'library:manage');
    const row = await this.prisma.libraryCategory.findUnique({ where: { id: parseId(id) } });
    if (!row) throw new NotFoundException('Không tìm thấy danh mục');
    try {
      await this.prisma.libraryCategory.delete({ where: { id: row.id } });
    } catch (err) {
      if (isForeignKeyViolation(err)) throw new ConflictException('Danh mục còn tài liệu hoặc danh mục con nên không xoá được');
      throw err;
    }
    await this.audit.record({
      userId: user.id,
      channel: 'web',
      action: 'library.category_delete',
      targetType: 'library_category',
      targetId: row.id.toString(),
      params: { name: row.name },
      ok: true,
      ip,
    });
    await this.revalidate.revalidate('library');
  }

  // ── Nội bộ ──

  // Kiểm tra và chuẩn hoá dữ liệu nhập: danh mục, môn tồn tại; đối tượng khối/lớp hợp lệ (lớp thuộc năm học hiện hành).
  private async fields(input: CreateItemInput) {
    const categoryId = BigInt(input.categoryId);
    const subjectId = input.subjectId ? BigInt(input.subjectId) : null;
    const [category, subject] = await Promise.all([
      this.prisma.libraryCategory.findUnique({ where: { id: categoryId } }),
      subjectId ? this.prisma.subject.findUnique({ where: { id: subjectId } }) : Promise.resolve(null),
    ]);
    if (!category) throw new BadRequestException('Danh mục không tồn tại');
    if (subjectId && !subject) throw new BadRequestException('Môn học không tồn tại');

    const gradeLevels = input.audience === 'GRADE' ? [...new Set(input.gradeLevels)].sort((a, b) => a - b) : [];
    if (input.audience === 'GRADE' && gradeLevels.length === 0) throw new BadRequestException('Chưa chọn khối được xem');
    let classIds: bigint[] = [];
    if (input.audience === 'CLASS') {
      const ids = [...new Set(input.classIds)].map((c) => BigInt(c));
      if (ids.length === 0) throw new BadRequestException('Chưa chọn lớp được xem');
      const year = await this.prisma.schoolYear.findFirst({ where: { isCurrent: true }, select: { id: true } });
      const found = year ? await this.prisma.schoolClass.count({ where: { id: { in: ids }, schoolYearId: year.id } }) : 0;
      if (found !== ids.length) throw new BadRequestException('Có lớp không thuộc năm học hiện hành');
      classIds = ids;
    }
    const scalars = {
      title: input.title,
      author: input.author,
      publisher: input.publisher,
      publishYear: input.publishYear ?? null,
      description: input.description,
      categoryId,
      subjectId,
      gradeLevel: input.gradeLevel ?? null,
      source: input.source,
      license: input.license,
      allowDownload: input.allowDownload,
      audience: input.audience,
      gradeLevels,
      searchText: normalizeSearch([input.title, input.author, input.publisher, input.description].filter(Boolean).join(' ')),
    };
    return { scalars, classIds };
  }

  private async find(id: string): Promise<ItemRow> {
    const row = await this.prisma.libraryItem.findUnique({ where: { id: parseId(id) }, include: ITEM_INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy tài liệu');
    return row;
  }

  // Người quản lý thấy mọi tài liệu; người gửi chỉ tài liệu của mình (của người khác thì 404).
  private async ownedOrManaged(user: AuthUser, id: string): Promise<ItemRow> {
    const row = await this.find(id);
    if (!can(user, 'library:manage') && row.submittedBy.toString() !== user.id) throw new NotFoundException('Không tìm thấy tài liệu');
    return row;
  }

  // Sửa/xoá/tải file: người quản lý mọi lúc; người gửi khi còn nháp hoặc bị từ chối.
  private async editable(user: AuthUser, id: string): Promise<ItemRow> {
    canSubmitOrManage(user);
    const row = await this.ownedOrManaged(user, id);
    if (!can(user, 'library:manage') && !OWNER_EDITABLE.includes(row.status)) {
      throw new ConflictException(`Tài liệu đang ở trạng thái "${LIBRARY_STATUS_NAMES[row.status]}" nên không sửa được`);
    }
    return row;
  }

  // Chuyển trạng thái có điều kiện (chống hai người duyệt cùng lúc).
  private async transition(row: ItemRow, from: LibraryStatus[], data: Prisma.LibraryItemUncheckedUpdateManyInput): Promise<ItemRow> {
    if (!from.includes(row.status)) {
      throw new ConflictException(`Tài liệu đang ở trạng thái "${LIBRARY_STATUS_NAMES[row.status]}"`);
    }
    const { count } = await this.prisma.libraryItem.updateMany({ where: { id: row.id, status: row.status }, data });
    if (count !== 1) throw new ConflictException('Tài liệu vừa được người khác thay đổi, hãy tải lại');
    return this.prisma.libraryItem.findUniqueOrThrow({ where: { id: row.id }, include: ITEM_INCLUDE });
  }

  // library_items.slug là UNIQUE: trùng tên thì thêm hậu tố -2, -3...
  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title).slice(0, 200) || 'tai-lieu';
    let slug = base;
    for (let i = 2; await this.prisma.libraryItem.count({ where: { slug } }); i++) slug = `${base}-${i}`;
    return slug;
  }

  private record(
    user: AuthUser,
    action: string,
    row: { id: bigint; title: string; kind: string; status: string },
    ip: string | undefined,
    extra: Record<string, unknown> = {},
    ok = true,
  ) {
    return this.audit.record({
      userId: user.id,
      channel: 'web',
      action,
      targetType: 'library_item',
      targetId: row.id.toString(),
      params: { title: row.title, kind: row.kind, status: row.status, ...extra },
      ok,
      ip,
    });
  }
}
