import { libraryAudienceLabel, type LibraryCardDto, type LibraryItemDto } from '@pvh/shared';
import type { Prisma } from '../../generated/prisma/client.js';

export const ITEM_INCLUDE = {
  category: { select: { name: true, slug: true } },
  subject: { select: { name: true } },
  classes: { select: { classId: true, class: { select: { name: true } } } },
  submitter: { select: { fullName: true } },
  reviewer: { select: { fullName: true } },
} satisfies Prisma.LibraryItemInclude;

export type ItemRow = Prisma.LibraryItemGetPayload<{ include: typeof ITEM_INCLUDE }>;

const classNames = (row: ItemRow) => row.classes.map((c) => c.class.name).sort((a, b) => a.localeCompare(b, 'vi'));

// Thẻ tài liệu: không bao giờ có khoá hay URL của kho riêng tư.
export function toCard(row: ItemRow): LibraryCardDto {
  return {
    id: row.id.toString(),
    slug: row.slug,
    title: row.title,
    author: row.author,
    description: row.description,
    coverUrl: row.coverUrl,
    kind: row.kind,
    categoryName: row.category.name,
    subjectName: row.subject?.name ?? null,
    gradeLevel: row.gradeLevel,
    audienceLabel: libraryAudienceLabel(row.audience, row.gradeLevels, classNames(row)),
    viewCount: row.viewCount,
    publishedAt: row.publishedAt?.toISOString() ?? null,
  };
}

export function toItem(row: ItemRow): LibraryItemDto {
  return {
    ...toCard(row),
    categoryId: row.categoryId.toString(),
    categorySlug: row.category.slug,
    subjectId: row.subjectId?.toString() ?? null,
    publisher: row.publisher,
    publishYear: row.publishYear,
    source: row.source,
    license: row.license,
    allowDownload: row.allowDownload,
    audience: row.audience,
    gradeLevels: row.gradeLevels,
    classIds: row.classes.map((c) => c.classId.toString()),
    classNames: classNames(row),
    status: row.status,
    hasFile: row.fileKey !== null,
    fileMime: row.fileMime,
    fileSize: row.fileSize,
    rejectReason: row.rejectReason,
    submittedById: row.submittedBy.toString(),
    submittedByName: row.submitter.fullName,
    reviewedByName: row.reviewer?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

