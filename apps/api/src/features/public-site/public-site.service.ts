import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PUBLIC_SETTING_KEYS,
  type AdmissionStatDto,
  type GalleryItemDto,
  type PublicPostDto,
  type PublicPostListDto,
  type PublicPostSummaryDto,
  type PublicSettingsDto,
} from '@pvh/shared';
import { RateLimitService } from '../../infrastructure/rate-limit/rate-limit.service.js';
import { stripHtml } from '../../common/utils/sanitize-content.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { StorageService } from '../../infrastructure/storage/storage.service.js';
import type { ListPublicPostsQuery } from './dto/public.dto.js';

const WITH_RELATIONS = {
  author: { select: { fullName: true } },
  category: { select: { name: true, slug: true } },
} satisfies Prisma.PostInclude;

type PublishedPost = Prisma.PostGetPayload<{ include: typeof WITH_RELATIONS }>;

const EXCERPT_LENGTH = 160;
const GALLERY_LIMIT = 60;
// Địa chỉ trong thuộc tính src của nội dung bài (đã được lọc phía server khi lưu).
const SRC_ATTR = /\bsrc="([^"]+)"/g;

// F01–F07 – dữ liệu cho website công khai. Chỉ trả bài PUBLISHED và không lộ thông tin cá nhân.
@Injectable()
export class PublicSiteService {
  // Mỗi IP chỉ tính một lượt xem cho một bài trong 30 phút.
  constructor(
    private readonly prisma: PrismaService,
    private readonly limits: RateLimitService,
    private readonly storage: StorageService,
  ) {}

  async listPosts(query: ListPublicPostsQuery): Promise<PublicPostListDto> {
    const categoryIds = query.category
      ? await this.categoryAndDescendants(query.category)
      : undefined;
    const where: Prisma.PostWhereInput = {
      status: 'PUBLISHED',
      categoryId: categoryIds ? { in: categoryIds } : undefined,
      OR: query.q
        ? [
            { title: { contains: query.q, mode: 'insensitive' } },
            { summary: { contains: query.q, mode: 'insensitive' } },
            { content: { contains: query.q, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const [total, posts] = await Promise.all([
      this.prisma.post.count({ where }),
      this.prisma.post.findMany({
        where,
        include: WITH_RELATIONS,
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return {
      items: posts.map(toSummary),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  // Bài chưa đăng, đã gỡ hoặc không có đều trả 404 như nhau.
  async getPost(slug: string): Promise<PublicPostDto> {
    const post = await this.prisma.post.findFirst({
      where: { slug, status: 'PUBLISHED' },
      include: WITH_RELATIONS,
    });
    if (!post) throw new NotFoundException('Không tìm thấy bài viết');
    return {
      ...toSummary(post),
      content: post.content,
      authorName: post.author.fullName,
    };
  }

  async recordView(slug: string, ip: string): Promise<void> {
    const { count } = await this.limits.increment('view', `${ip}|${slug}`, 30 * 60);
    if (count > 1) return;
    await this.prisma.post.updateMany({
      where: { slug, status: 'PUBLISHED' },
      data: { viewCount: { increment: 1 } },
    });
  }

  async admission(): Promise<AdmissionStatDto[]> {
    const stats = await this.prisma.admissionStat.findMany({
      orderBy: { schoolYear: 'desc' },
    });
    return stats.map((s) => ({
      schoolYear: s.schoolYear,
      quota: s.quota,
      benchmarkNv1: s.benchmarkNv1 ? Number(s.benchmarkNv1) : null,
      benchmarkNv2: s.benchmarkNv2 ? Number(s.benchmarkNv2) : null,
      benchmarkNv3: s.benchmarkNv3 ? Number(s.benchmarkNv3) : null,
      note: s.note,
    }));
  }

  // Chỉ các khóa trong danh sách cho phép; khóa khác của system_settings không bao giờ ra công khai.
  async settings(): Promise<PublicSettingsDto> {
    const rows = await this.prisma.systemSetting.findMany({
      where: { key: { in: [...PUBLIC_SETTING_KEYS] } },
    });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  // Ảnh/video đại diện và chèn trong các bài đã đăng (media của bài nháp không lộ ra). Chỉ trả file của hệ thống
  // đã hoàn tất kiểm tra (bản ghi media READY).
  async gallery(): Promise<GalleryItemDto[]> {
    const posts = await this.prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: 100,
      select: { slug: true, title: true, thumbnailUrl: true, content: true },
    });
    const firstPostOfKey = new Map<string, { slug: string; title: string }>();
    for (const post of posts) {
      const urls = [
        ...(post.thumbnailUrl ? [post.thumbnailUrl] : []),
        ...[...post.content.matchAll(SRC_ATTR)].map((m) => m[1].replaceAll('&amp;', '&')),
      ];
      for (const url of urls) {
        const key = this.storage.keyFromUrl(url);
        if (key && !firstPostOfKey.has(key)) firstPostOfKey.set(key, { slug: post.slug, title: post.title });
      }
    }
    if (firstPostOfKey.size === 0) return [];
    const rows = await this.prisma.media.findMany({
      where: { storageKey: { in: [...firstPostOfKey.keys()] }, status: 'READY' },
      select: { storageKey: true, url: true, kind: true },
    });
    const byKey = new Map(rows.map((r) => [r.storageKey, r]));
    const items: GalleryItemDto[] = [];
    for (const [key, post] of firstPostOfKey) {
      const row = byKey.get(key);
      if (row) items.push({ url: row.url, kind: row.kind, postSlug: post.slug, postTitle: post.title });
      if (items.length >= GALLERY_LIMIT) break;
    }
    return items;
  }

  // Chuyên mục theo slug cùng mọi chuyên mục con cháu; không có → danh sách rỗng (kết quả rỗng).
  private async categoryAndDescendants(slug: string): Promise<bigint[]> {
    const all = await this.prisma.category.findMany({
      select: { id: true, parentId: true, slug: true },
    });
    const root = all.find((c) => c.slug === slug);
    if (!root) return [];
    const ids = [root.id];
    for (let i = 0; i < ids.length; i++) {
      for (const c of all) if (c.parentId === ids[i]) ids.push(c.id);
    }
    return ids;
  }
}

function toSummary(post: PublishedPost): PublicPostSummaryDto {
  return {
    id: post.id.toString(),
    slug: post.slug,
    title: post.title,
    excerpt: post.summary || excerptOf(post.content),
    thumbnailUrl: post.thumbnailUrl,
    categoryName: post.category?.name ?? null,
    categorySlug: post.category?.slug ?? null,
    // Bài PUBLISHED luôn có published_at; dự phòng bằng created_at cho dữ liệu cũ.
    publishedAt: (post.publishedAt ?? post.createdAt).toISOString(),
    viewCount: post.viewCount,
  };
}

function excerptOf(html: string): string {
  const text = stripHtml(html).replace(/\s+/g, ' ');
  return text.length > EXCERPT_LENGTH
    ? `${text.slice(0, EXCERPT_LENGTH).trimEnd()}…`
    : text;
}
