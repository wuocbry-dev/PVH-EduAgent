import { Injectable } from '@nestjs/common';
import type { PostDto, PostStatus } from '@pvh/shared';
import { assertPermission } from '../../common/guards/permission.js';
import type { AuthUser } from '../../common/types/auth-user.js';
import { slugify } from '../../common/utils/slugify.js';
import type { Post } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/database/prisma.service.js';
import type { CreatePostInput } from './dto/create-post.dto.js';

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublished(): Promise<PostDto[]> {
    const posts = await this.prisma.post.findMany({
      where: { status: 'PUBLISHED' },
      orderBy: { publishedAt: 'desc' },
      take: 20,
    });
    return posts.map(toPostDto);
  }

  async list(user: AuthUser, status?: PostStatus): Promise<PostDto[]> {
    assertPermission(user, 'post:create');
    const posts = await this.prisma.post.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return posts.map(toPostDto);
  }

  countByStatus(status: PostStatus): Promise<number> {
    return this.prisma.post.count({ where: { status } });
  }

  async createDraft(user: AuthUser, input: CreatePostInput): Promise<PostDto> {
    assertPermission(user, 'post:create');
    const post = await this.prisma.post.create({
      data: {
        ...input,
        slug: await this.uniqueSlug(input.title),
        authorId: BigInt(user.id),
      },
    });
    return toPostDto(post);
  }

  // posts.slug là UNIQUE: trùng tiêu đề thì thêm hậu tố -2, -3...
  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'bai-viet';
    let slug = base;
    for (let i = 2; await this.prisma.post.count({ where: { slug } }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }
}

function toPostDto(post: Post): PostDto {
  return {
    id: post.id.toString(),
    title: post.title,
    slug: post.slug,
    summary: post.summary,
    content: post.content,
    status: post.status,
    authorId: post.authorId.toString(),
    publishAt: post.publishAt?.toISOString() ?? null,
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
  };
}
