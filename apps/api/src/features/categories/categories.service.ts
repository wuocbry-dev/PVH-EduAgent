import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CategoryDto } from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { parseId } from '../../common/utils/parse-id.js';
import { stripHtml } from '../../common/utils/sanitize-content.js';
import { slugify } from '../../common/utils/slugify.js';
import type { Category } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import { RevalidateService } from '../../infrastructure/revalidate/revalidate.service.js';
import { AuditLogService } from '../audit-log/audit-log.service.js';
import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from './dto/categories.dto.js';

// F13 – chuyên mục dạng cây (cha–con). Xem là công khai; sửa cần quyền post:approve (biên tập).
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditLogService,
    private readonly revalidate: RevalidateService,
  ) {}

  async list(): Promise<CategoryDto[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return categories.map(toCategoryDto);
  }

  async create(
    user: AuthUser,
    input: CreateCategoryInput,
    ip?: string,
  ): Promise<CategoryDto> {
    assertPermission(user, 'post:approve');
    const name = this.cleanName(input.name);
    const parentId = await this.parentIdOrThrow(input.parentId);
    const category = await this.prisma.category.create({
      data: {
        name,
        slug: await this.uniqueSlug(name),
        parentId,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    await this.record(user, 'create', category, ip, { name });
    return toCategoryDto(category);
  }

  async update(
    user: AuthUser,
    id: string,
    input: UpdateCategoryInput,
    ip?: string,
  ): Promise<CategoryDto> {
    assertPermission(user, 'post:approve');
    const category = await this.findOrThrow(id);

    let parentId: bigint | null | undefined;
    if (input.parentId !== undefined) {
      parentId = await this.parentIdOrThrow(input.parentId);
      if (parentId !== null) await this.assertNoCycle(category.id, parentId);
    }
    const updated = await this.prisma.category.update({
      where: { id: category.id },
      data: {
        name: input.name === undefined ? undefined : this.cleanName(input.name),
        parentId,
        sortOrder: input.sortOrder,
      },
    });
    await this.record(user, 'update', updated, ip, { ...input });
    return toCategoryDto(updated);
  }

  // Không xóa chuyên mục còn chuyên mục con; bài viết thuộc chuyên mục thì chuyển về "chưa phân loại".
  async remove(user: AuthUser, id: string, ip?: string): Promise<void> {
    assertPermission(user, 'post:approve');
    const category = await this.findOrThrow(id);
    const children = await this.prisma.category.count({
      where: { parentId: category.id },
    });
    if (children > 0) {
      throw new BadRequestException(
        'Chuyên mục còn chuyên mục con, hãy xóa hoặc chuyển chúng trước',
      );
    }
    await this.prisma.category.delete({ where: { id: category.id } });
    await this.record(user, 'delete', category, ip, { name: category.name });
  }

  private async findOrThrow(id: string): Promise<Category> {
    const category = await this.prisma.category.findUnique({
      where: { id: parseId(id) },
    });
    if (!category) throw new NotFoundException('Không tìm thấy chuyên mục');
    return category;
  }

  private async parentIdOrThrow(
    parentId: string | null | undefined,
  ): Promise<bigint | null> {
    if (!parentId) return null;
    return (await this.findParent(parentId)).id;
  }

  private async findParent(parentId: string): Promise<Category> {
    const parent = await this.prisma.category.findUnique({
      where: { id: parseId(parentId) },
    });
    if (!parent) throw new BadRequestException('Chuyên mục cha không tồn tại');
    return parent;
  }

  // Đi ngược từ chuyên mục cha lên gốc; gặp chính chuyên mục đang sửa nghĩa là tạo vòng lặp.
  private async assertNoCycle(id: bigint, parentId: bigint): Promise<void> {
    let current: bigint | null = parentId;
    const seen = new Set<bigint>();
    while (current !== null && !seen.has(current)) {
      if (current === id) {
        throw new BadRequestException(
          'Không thể đặt chuyên mục làm con của chính nó hoặc của chuyên mục con của nó',
        );
      }
      seen.add(current);
      const next: { parentId: bigint | null } | null =
        await this.prisma.category.findUnique({
          where: { id: current },
          select: { parentId: true },
        });
      current = next?.parentId ?? null;
    }
  }

  private cleanName(name: string): string {
    const clean = stripHtml(name);
    if (!clean) throw new BadRequestException('Chưa nhập tên chuyên mục');
    return clean;
  }

  private async uniqueSlug(name: string): Promise<string> {
    const base = slugify(name) || 'chuyen-muc';
    let slug = base;
    for (
      let i = 2;
      await this.prisma.category.count({ where: { slug } });
      i++
    ) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  private record(
    user: AuthUser,
    action: string,
    category: Category,
    ip: string | undefined,
    params: Record<string, unknown>,
  ): Promise<void> {
    return this.audit.record({
      userId: user.id,
      channel: 'web',
      action: `category.${action}`,
      targetType: 'category',
      targetId: category.id.toString(),
      params,
      ok: true,
      ip,
    }).then(() => this.revalidate.revalidate('categories', 'posts'));
  }
}

function toCategoryDto(category: Category): CategoryDto {
  return {
    id: category.id.toString(),
    parentId: category.parentId?.toString() ?? null,
    name: category.name,
    slug: category.slug,
    sortOrder: category.sortOrder,
  };
}
