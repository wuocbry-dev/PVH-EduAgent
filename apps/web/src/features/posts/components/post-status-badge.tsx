import { POST_STATUS_NAMES, type PostStatus } from "@pvh/shared";

const COLORS: Record<PostStatus, string> = {
  DRAFT: "bg-gray-200 text-gray-800",
  PENDING_REVIEW: "bg-amber-200 text-amber-900",
  REJECTED: "bg-red-200 text-red-900",
  SCHEDULED: "bg-blue-200 text-blue-900",
  PUBLISHED: "bg-green-200 text-green-900",
  ARCHIVED: "bg-zinc-300 text-zinc-800",
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${COLORS[status]}`}>{POST_STATUS_NAMES[status]}</span>;
}
