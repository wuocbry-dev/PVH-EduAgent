import { ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import {
  LIBRARY_ACCESS_PER_MINUTE,
  normalizeSearch,
  type LibraryAccessDto,
  type LibraryCardDto,
  type LibraryCategoryDto,
  type LibraryHomeDto,
  type LibraryItemDto,
  type LibraryListDto,
  type LibraryMineDto,
  type LibraryShelfItemDto,
  type LibraryStatsDto,
} from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { LocalPrivateStorageService } from '../../infrastructure/storage/local-private-storage.service.js';
import { contentDisposition, PrivateStorageService } from '../../infrastructure/storage/private-storage.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import { addDays, vnToday } from '../timetable/timetable-dates.js';
import type { ListQuery } from './dto/library.dto.js';
import { canRead, libraryViewer, publishedWhere, type LibraryViewer } from './library-audience.js';
import { ITEM_INCLUDE, toCard, toItem, type ItemRow } from './library-mappers.js';

const HOME_LIMIT = 8;
// Mở lại cùng tài liệu trong khoảng này chỉ tính một lượt đọc.
const VIEW_DEDUPE_SEC = 30 * 60;

const dateOf = (day: string) => new Date(`${day}T00:00:00Z`);

// Thư viện số – phía người đọc (bước 21): danh mục, tìm kiếm, cấp URL đọc hết hạn ngắn, yêu thích, đọc tiếp, thống kê.
// Mọi danh sách đều lọc theo đối tượng xem (library-audience.ts); khách chỉ thấy tài liệu toàn trường.
@Injectable()
export class LibraryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly limits: RateLimitService,
    private readonly files: PrivateStorageService,
  ) {}

  viewer(user: AuthUser | null): Promise<LibraryViewer> {
    return libraryViewer(this.prisma, user);
  }

  async home(user: AuthUser | null): Promise<LibraryHomeDto> {
    const viewer = await this.viewer(user);
    const where = publishedWhere(viewer);
    const [categories, counts, newest, mostRead] = await Promise.all([
      this.prisma.libraryCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.libraryItem.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
      this.prisma.libraryItem.findMany({ where, include: ITEM_INCLUDE, orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }], take: HOME_LIMIT }),
      this.prisma.libraryItem.findMany({
        where: { AND: [where, { viewCount: { gt: 0 } }] },
        include: ITEM_INCLUDE,
        orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
        take: HOME_LIMIT,
      }),
    ]);
    const countOf = new Map(counts.map((c) => [c.categoryId.toString(), c._count._all]));
    return {
      categories: categories.map(
        (c): LibraryCategoryDto => ({
          id: c.id.toString(),
          name: c.name,
          slug: c.slug,
          parentId: c.parentId?.toString() ?? null,
          sortOrder: c.sortOrder,
          itemCount: countOf.get(c.id.toString()) ?? 0,
        }),
      ),
      newest: newest.map(toCard),
      mostRead: mostRead.map(toCard),
    };
  }

  async list(user: AuthUser | null, query: ListQuery): Promise<LibraryListDto> {
    const viewer = await this.viewer(user);
    const and: Prisma.LibraryItemWhereInput[] = [publishedWhere(viewer)];
    const q = query.q ? normalizeSearch(query.q) : '';
    // Tìm không dấu: so với cột search_text đã bỏ dấu (index pg_trgm); mỗi từ phải có mặt.
    for (const word of q.split(' ').filter(Boolean).slice(0, 8)) and.push({ searchText: { contains: word } });
    if (query.category) {
      const category = await this.prisma.libraryCategory.findUnique({ where: { slug: query.category }, include: { children: true } });
      if (!category) return { items: [], total: 0, page: query.page, pageSize: query.pageSize };
      and.push({ categoryId: { in: [category.id, ...category.children.map((c) => c.id)] } });
    }
    if (query.kind) and.push({ kind: query.kind });
    if (query.subjectId) and.push({ subjectId: BigInt(query.subjectId) });
    if (query.gradeLevel) and.push({ gradeLevel: query.gradeLevel });
    const where = { AND: and };
    const [total, rows] = await Promise.all([
      this.prisma.libraryItem.count({ where }),
      this.prisma.libraryItem.findMany({
        where,
        include: ITEM_INCLUDE,
        orderBy: query.sort === 'popular' ? [{ viewCount: 'desc' }, { id: 'desc' }] : [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { items: rows.map(toCard), total, page: query.page, pageSize: query.pageSize };
  }

  // Trang tài liệu: chỉ tài liệu đã đăng và đúng đối tượng (không đúng thì 404, không lộ là có tồn tại).
  async bySlug(user: AuthUser | null, slug: string): Promise<LibraryItemDto> {
    const viewer = await this.viewer(user);
    const row = await this.prisma.libraryItem.findFirst({ where: { AND: [{ slug }, publishedWhere(viewer)] }, include: ITEM_INCLUDE });
    if (!row) throw new NotFoundException('Không tìm thấy tài liệu');
    const dto = toItem(row);
    // Khách không cần biết ai gửi/duyệt; dữ liệu này cũng nằm trong cache công khai của web.
    if (!user) return { ...dto, submittedById: '', submittedByName: '', reviewedByName: null, rejectReason: null };
    const uid = BigInt(user.id);
    const [favorite, progress] = await Promise.all([
      this.prisma.libraryFavorite.findUnique({ where: { userId_itemId: { userId: uid, itemId: row.id } } }),
      this.prisma.libraryReadingProgress.findUnique({ where: { userId_itemId: { userId: uid, itemId: row.id } } }),
    ]);
    return { ...dto, favorite: !!favorite, position: progress?.position ?? null };
  }

  // Cấp URL đọc/tải hết hạn ngắn, sau khi kiểm tra lại quyền xem. URL không được ghi vào log hay audit.
  async access(user: AuthUser, id: string, download: boolean, ip?: string): Promise<LibraryAccessDto> {
    const row = await this.readable(user, id);
    if (!row.fileKey || !row.fileMime) throw new NotFoundException('Tài liệu chưa có file');
    if (download && !row.allowDownload) throw new ForbiddenException('Tài liệu này không cho phép tải về');

    const { count, retryAfterSec } = await this.limits.increment('library-access', user.id, 60);
    if (count > LIBRARY_ACCESS_PER_MINUTE) {
      throw new HttpException(`Bạn mở tài liệu quá nhanh, vui lòng thử lại sau ${retryAfterSec} giây`, HttpStatus.TOO_MANY_REQUESTS);
    }
    const ext = row.fileMime === 'application/pdf' ? 'pdf' : row.fileMime === 'audio/mpeg' ? 'mp3' : row.fileMime.split('/')[1];
    const signed = await this.files.presignGet({
      id: row.id.toString(),
      key: row.fileKey,
      mimeType: row.fileMime,
      download,
      filename: `${row.title.slice(0, 80)}.${ext}`,
    });
    if (row.status === 'PUBLISHED') await this.countView(user, row.id);
    const progress = await this.prisma.libraryReadingProgress.findUnique({
      where: { userId_itemId: { userId: BigInt(user.id), itemId: row.id } },
    });
    if (download) {
      await this.audit.record({
        userId: user.id,
        channel: 'web',
        action: 'library.download',
        targetType: 'library_item',
        targetId: row.id.toString(),
        params: { title: row.title },
        ok: true,
        ip,
      });
    }
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString(), mimeType: row.fileMime, kind: row.kind, position: progress?.position ?? null };
  }

  async saveProgress(user: AuthUser, id: string, position: number): Promise<void> {
    const row = await this.readable(user, id);
    const key = { userId: BigInt(user.id), itemId: row.id };
    await this.prisma.libraryReadingProgress.upsert({ where: { userId_itemId: key }, update: { position }, create: { ...key, position } });
  }

  async setFavorite(user: AuthUser, id: string, favorite: boolean): Promise<void> {
    const row = await this.readable(user, id);
    const key = { userId: BigInt(user.id), itemId: row.id };
    if (favorite) await this.prisma.libraryFavorite.upsert({ where: { userId_itemId: key }, update: {}, create: key });
    else await this.prisma.libraryFavorite.deleteMany({ where: key });
  }

  // Tủ sách: yêu thích và lịch sử đọc (chỉ tài liệu còn đọc được; tài liệu bị ẩn hay đổi đối tượng thì tự biến mất).
  async mine(user: AuthUser): Promise<LibraryMineDto> {
    const viewer = await this.viewer(user);
    const uid = BigInt(user.id);
    const visible = publishedWhere(viewer);
    const [favorites, history] = await Promise.all([
      this.prisma.libraryFavorite.findMany({
        where: { userId: uid, item: visible },
        include: { item: { include: { ...ITEM_INCLUDE, progress: { where: { userId: uid } } } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      this.prisma.libraryReadingProgress.findMany({
        where: { userId: uid, item: visible },
        include: { item: { include: { ...ITEM_INCLUDE, favorites: { where: { userId: uid } } } } },
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
    ]);
    return {
      favorites: favorites.map((f) => shelf(f.item, f.item.progress[0] ?? null, true)),
      history: history.map((p) => shelf(p.item, p, p.item.favorites.length > 0)),
    };
  }

  // Thống kê lượt đọc theo ngày giờ Việt Nam và tài liệu được đọc nhiều nhất.
  async stats(user: AuthUser): Promise<LibraryStatsDto> {
    assertPermission(user, 'library:manage');
    const today = vnToday();
    const monthStart = `${today.slice(0, 8)}01`;
    const lastMonthStart = `${addDays(monthStart, -1).slice(0, 8)}01`;
    const sum = (where: Prisma.LibraryViewDailyWhereInput) =>
      this.prisma.libraryViewDaily.aggregate({ where, _sum: { count: true } }).then((r) => r._sum.count ?? 0);
    const [todayCount, yesterday, thisMonth, lastMonth, total, published, pending, all, top] = await Promise.all([
      sum({ day: dateOf(today) }),
      sum({ day: dateOf(addDays(today, -1)) }),
      sum({ day: { gte: dateOf(monthStart) } }),
      sum({ day: { gte: dateOf(lastMonthStart), lt: dateOf(monthStart) } }),
      sum({}),
      this.prisma.libraryItem.count({ where: { status: 'PUBLISHED' } }),
      this.prisma.libraryItem.count({ where: { status: 'PENDING_REVIEW' } }),
      this.prisma.libraryItem.count(),
      this.prisma.libraryItem.findMany({
        where: { viewCount: { gt: 0 } },
        orderBy: [{ viewCount: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { id: true, slug: true, title: true, viewCount: true },
      }),
    ]);
    return {
      views: { today: todayCount, yesterday, thisMonth, lastMonth, total },
      items: { published, pending, total: all },
      top: top.map((t) => ({ id: t.id.toString(), slug: t.slug, title: t.title, views: t.viewCount })),
    };
  }

  // Tra cứu cho AI Agent: chỉ nhân sự, chỉ tài liệu đã đăng; trả đường dẫn trang tài liệu, không bao giờ trả URL kho.
  async searchForAgent(user: AuthUser, query: { q?: string; gradeLevel?: number; kind?: ListQuery['kind'] }) {
    if (!user.roles.some((r) => r !== 'STUDENT')) throw new ForbiddenException('Chỉ giáo viên và nhân sự được tra cứu thư viện qua Trợ lý AI');
    const result = await this.list(user, { ...query, sort: 'new', page: 1, pageSize: 10 });
    return {
      total: result.total,
      items: result.items.map((i) => ({
        title: i.title,
        author: i.author,
        kind: i.kind,
        category: i.categoryName,
        subject: i.subjectName,
        gradeLevel: i.gradeLevel,
        audience: i.audienceLabel,
        path: `/thu-vien/tai-lieu/${i.slug}`,
      })),
    };
  }

  // Driver local: file cho URL đọc đã ký (token `get` hết hạn ngắn). Quyền đã kiểm tra lúc cấp URL; ở đây chỉ kiểm tra
  // token và file vẫn là file hiện tại của tài liệu (đã thay/xoá thì URL cũ hết dùng được).
  async resolveLocalFile(id: string, token: string) {
    if (!(this.files instanceof LocalPrivateStorageService)) throw new NotFoundException('Không tìm thấy file');
    const claims = this.files.verifyToken(token, 'get');
    if (!claims || claims.id !== id) throw new ForbiddenException('Liên kết đọc không hợp lệ hoặc đã hết hạn');
    const exists = await this.prisma.libraryItem.count({ where: { id: parseId(id), fileKey: claims.key } });
    if (!exists) throw new NotFoundException('Không tìm thấy file');
    return {
      root: this.files.dir,
      name: claims.key,
      mime: claims.mimeType,
      disposition: contentDisposition(!!claims.download, claims.filename ?? 'tai-lieu'),
    };
  }

  // Tài liệu người này được đọc; không được thì 404 (không lộ tài liệu có tồn tại hay không).
  private async readable(user: AuthUser, id: string): Promise<ItemRow> {
    const row = await this.prisma.libraryItem.findUnique({ where: { id: parseId(id) }, include: ITEM_INCLUDE });
    const viewer = await this.viewer(user);
    if (!row || !canRead(viewer, { ...row, classIds: row.classes.map((c) => c.classId) })) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    return row;
  }

  // Một lượt đọc / người / tài liệu trong 30 phút, cộng vào bảng gộp theo ngày.
  private async countView(user: AuthUser, itemId: bigint): Promise<void> {
    const { count } = await this.limits.increment('library-view', `${user.id}:${itemId}`, VIEW_DEDUPE_SEC);
    if (count > 1) return;
    const day = dateOf(vnToday());
    await this.prisma.$transaction([
      this.prisma.libraryViewDaily.upsert({
        where: { itemId_day: { itemId, day } },
        update: { count: { increment: 1 } },
        create: { itemId, day, count: 1 },
      }),
      this.prisma.libraryItem.update({ where: { id: itemId }, data: { viewCount: { increment: 1 } } }),
    ]);
  }
}

function shelf(
  row: ItemRow,
  progress: { position: number; updatedAt: Date } | null,
  favorite: boolean,
): LibraryShelfItemDto {
  const card: LibraryCardDto = toCard(row);
  return { ...card, position: progress?.position ?? null, lastReadAt: progress?.updatedAt.toISOString() ?? null, favorite };
}
