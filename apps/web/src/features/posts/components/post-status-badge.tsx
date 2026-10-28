import { POST_STATUS_NAMES, type PostStatus } from "@pvh/shared";
import { Badge, type BadgeTone } from "@/shared/ui";

const TONES: Record<PostStatus, BadgeTone> = {
  DRAFT: "neutral",
  PENDING_REVIEW: "warning",
  REJECTED: "danger",
  SCHEDULED: "primary",
  PUBLISHED: "success",
  ARCHIVED: "neutral",
};

export function PostStatusBadge({ status }: { status: PostStatus }) {
  return <Badge tone={TONES[status]}>{POST_STATUS_NAMES[status]}</Badge>;
}
