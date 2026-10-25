import {
  POST_STATUS_NAMES,
  type Permission,
  type PostAction,
  type PostStatus,
} from '@pvh/shared';

// Luật chuyển trạng thái của bài viết, theo sơ đồ trạng thái (docs/diagrams/drawio/21-State-Machine-Bai-viet.drawio).
// Đây là nơi duy nhất định nghĩa: thao tác nào, từ trạng thái nào, ai được làm, và đi tới trạng thái nào.

export class PostTransitionError extends Error {}

interface Rule {
  from: readonly PostStatus[];
  // Người dùng cần có đủ các quyền này.
  permissions: readonly Permission[];
  // Chỉ tác giả của bài được làm.
  authorOnly?: boolean;
  // Chỉ vai trò ADMIN (xóa vĩnh viễn).
  adminOnly?: boolean;
}

export const POST_RULES: Record<PostAction, Rule> = {
  // Sửa nội dung; bài bị từ chối được sửa thì quay về nháp.
  edit: { from: ['DRAFT', 'REJECTED'], permissions: ['post:create'], authorOnly: true },
  submit: { from: ['DRAFT'], permissions: ['post:create'], authorOnly: true },
  // Duyệt dẫn thẳng tới SCHEDULED (có publishAt) hoặc PUBLISHED (đăng ngay),
  // nên cần cả quyền duyệt lẫn quyền hẹn giờ/đăng.
  approve: { from: ['PENDING_REVIEW'], permissions: ['post:approve', 'post:schedule'] },
  reject: { from: ['PENDING_REVIEW'], permissions: ['post:approve'] },
  reschedule: { from: ['SCHEDULED'], permissions: ['post:schedule'] },
  publish: { from: ['SCHEDULED'], permissions: ['post:schedule'] },
  cancel_schedule: { from: ['SCHEDULED'], permissions: ['post:schedule'] },
  unpublish: { from: ['PUBLISHED'], permissions: ['post:unpublish'] },
  restore: { from: ['ARCHIVED'], permissions: ['post:unpublish'] },
  // Xóa nháp (tác giả) hoặc xóa vĩnh viễn bài đã gỡ (ADMIN); xem canDelete().
  delete: { from: ['DRAFT', 'ARCHIVED'], permissions: [] },
};

export interface TransitionInput {
  publishAt?: Date | null;
  now?: Date;
}

// Trạng thái sau khi thực hiện `action` trên bài đang ở `from`. Ném PostTransitionError (thông báo
// tiếng Việt) nếu sai luật. Chưa kiểm tra quyền: việc đó thuộc service (assertPermission).
export function nextStatus(
  action: PostAction,
  from: PostStatus,
  input: TransitionInput = {},
): PostStatus {
  const rule = POST_RULES[action];
  if (!rule.from.includes(from)) {
    throw new PostTransitionError(
      `Không thể ${ACTION_LABELS[action]} bài viết đang ở trạng thái "${POST_STATUS_NAMES[from]}"` +
        ` (chỉ áp dụng cho: ${rule.from.map((s) => `"${POST_STATUS_NAMES[s]}"`).join(', ')})`,
    );
  }

  switch (action) {
    case 'edit':
      return 'DRAFT';
    case 'submit':
      return 'PENDING_REVIEW';
    case 'reject':
      return 'REJECTED';
    case 'approve':
      // Không hẹn giờ → đăng ngay.
      return input.publishAt ? scheduled(input) : 'PUBLISHED';
    case 'reschedule':
      return scheduled(input);
    case 'publish':
      return 'PUBLISHED';
    case 'unpublish':
      return 'ARCHIVED';
    case 'cancel_schedule':
    case 'restore':
      return 'DRAFT';
    case 'delete':
      // Xóa không chuyển sang trạng thái khác: bài bị xóa khỏi CSDL.
      return from;
  }
}

function scheduled({ publishAt, now = new Date() }: TransitionInput): 'SCHEDULED' {
  if (!publishAt) {
    throw new PostTransitionError('Cần chọn thời điểm đăng bài');
  }
  if (publishAt <= now) {
    throw new PostTransitionError('Thời điểm hẹn giờ phải ở tương lai');
  }
  return 'SCHEDULED';
}

const ACTION_LABELS: Record<PostAction, string> = {
  edit: 'sửa',
  submit: 'gửi duyệt',
  approve: 'duyệt',
  reject: 'từ chối',
  reschedule: 'dời lịch',
  publish: 'đăng ngay',
  cancel_schedule: 'hủy lịch',
  unpublish: 'gỡ',
  restore: 'khôi phục',
  delete: 'xóa',
};

export interface PostActor {
  id: string;
  roles: readonly string[];
  permissions: readonly Permission[];
}

export interface PostRef {
  status: PostStatus;
  authorId: string;
}

// Người dùng có đủ điều kiện (quyền, tác giả, vai trò) cho thao tác này không — chưa xét trạng thái.
export function actorMay(
  action: PostAction,
  post: PostRef,
  actor: PostActor,
): boolean {
  const rule = POST_RULES[action];
  if (!rule.permissions.every((p) => actor.permissions.includes(p))) {
    return false;
  }
  if (action === 'delete') {
    return post.status === 'DRAFT'
      ? post.authorId === actor.id
      : actor.roles.includes('ADMIN');
  }
  return !rule.authorOnly || post.authorId === actor.id;
}

// Các thao tác hiển thị trên giao diện cho bài này (đúng trạng thái và đủ quyền).
export function allowedActions(post: PostRef, actor: PostActor): PostAction[] {
  return (Object.keys(POST_RULES) as PostAction[]).filter(
    (action) =>
      POST_RULES[action].from.includes(post.status) &&
      actorMay(action, post, actor),
  );
}
