import {
  POST_ACTIONS,
  POST_STATUSES,
  ROLE_PERMISSIONS,
  type PostAction,
  type PostStatus,
  type Role,
} from '@pvh/shared';
import {
  allowedActions,
  nextStatus,
  PostTransitionError,
  POST_RULES,
  type PostActor,
} from './posts.state-machine.js';

const NOW = new Date('2026-10-25T00:00:00Z');
const FUTURE = new Date('2026-10-26T00:00:00Z');
const PAST = new Date('2026-10-24T00:00:00Z');

// Mọi cạnh trong sơ đồ trạng thái (hình 21): [thao tác, từ, tới, tham số].
const EDGES: [PostAction, PostStatus, PostStatus, { publishAt?: Date }?][] = [
  ['edit', 'DRAFT', 'DRAFT'],
  ['edit', 'REJECTED', 'DRAFT'], // chỉnh sửa bài bị từ chối → quay về nháp
  ['submit', 'DRAFT', 'PENDING_REVIEW'],
  ['reject', 'PENDING_REVIEW', 'REJECTED'],
  ['approve', 'PENDING_REVIEW', 'SCHEDULED', { publishAt: FUTURE }],
  ['approve', 'PENDING_REVIEW', 'PUBLISHED'], // đăng ngay
  ['reschedule', 'SCHEDULED', 'SCHEDULED', { publishAt: FUTURE }],
  ['publish', 'SCHEDULED', 'PUBLISHED'],
  ['cancel_schedule', 'SCHEDULED', 'DRAFT'],
  ['unpublish', 'PUBLISHED', 'ARCHIVED'],
  ['restore', 'ARCHIVED', 'DRAFT'],
  ['delete', 'DRAFT', 'DRAFT'], // xóa nháp
  ['delete', 'ARCHIVED', 'ARCHIVED'], // xóa vĩnh viễn
];

describe('posts.state-machine', () => {
  describe('nextStatus', () => {
    it.each(EDGES)('%s: %s → %s', (action, from, to, input) => {
      expect(nextStatus(action, from, { ...input, now: NOW })).toBe(to);
    });

    it('mọi cặp (thao tác, trạng thái) ngoài sơ đồ đều bị từ chối kèm thông báo rõ ràng', () => {
      const allowed = new Set(EDGES.map(([a, f]) => `${a}:${f}`));
      let rejected = 0;
      for (const action of POST_ACTIONS) {
        for (const from of POST_STATUSES) {
          if (allowed.has(`${action}:${from}`)) continue;
          expect(() =>
            nextStatus(action, from, { publishAt: FUTURE, now: NOW }),
          ).toThrowError(PostTransitionError);
          rejected++;
        }
      }
      expect(rejected).toBe(POST_ACTIONS.length * POST_STATUSES.length - allowed.size);
    });

    it('thông báo lỗi nêu rõ thao tác và trạng thái hiện tại', () => {
      expect(() => nextStatus('approve', 'DRAFT')).toThrowError(
        /Không thể duyệt bài viết đang ở trạng thái "Nháp".*"Chờ duyệt"/,
      );
      expect(() => nextStatus('unpublish', 'SCHEDULED')).toThrowError(
        /Không thể gỡ bài viết đang ở trạng thái "Đã lên lịch"/,
      );
    });

    it('hẹn giờ phải ở tương lai', () => {
      expect(() =>
        nextStatus('approve', 'PENDING_REVIEW', { publishAt: PAST, now: NOW }),
      ).toThrowError('Thời điểm hẹn giờ phải ở tương lai');
      expect(() =>
        nextStatus('approve', 'PENDING_REVIEW', { publishAt: NOW, now: NOW }),
      ).toThrowError('Thời điểm hẹn giờ phải ở tương lai');
      expect(() =>
        nextStatus('reschedule', 'SCHEDULED', { publishAt: PAST, now: NOW }),
      ).toThrowError('Thời điểm hẹn giờ phải ở tương lai');
    });

    it('dời lịch bắt buộc có thời điểm mới', () => {
      expect(() => nextStatus('reschedule', 'SCHEDULED')).toThrowError(
        'Cần chọn thời điểm đăng bài',
      );
    });
  });

  describe('quyền theo trạng thái (allowedActions)', () => {
    const actor = (id: string, role: Role): PostActor => ({
      id,
      roles: [role],
      permissions: [...ROLE_PERMISSIONS[role]],
    });
    const post = (status: PostStatus, authorId = '1') => ({ status, authorId });

    it('tác giả (giáo viên) chỉ sửa/gửi/xóa bài nháp của mình, sửa bài bị từ chối', () => {
      const teacher = actor('1', 'TEACHER');
      expect(allowedActions(post('DRAFT'), teacher).sort()).toEqual(
        ['delete', 'edit', 'submit'].sort(),
      );
      expect(allowedActions(post('REJECTED'), teacher)).toEqual(['edit']);
      expect(allowedActions(post('PENDING_REVIEW'), teacher)).toEqual([]);
      expect(allowedActions(post('PUBLISHED'), teacher)).toEqual([]);
    });

    it('người khác không sửa/gửi/xóa bài nháp của tác giả', () => {
      expect(allowedActions(post('DRAFT', '1'), actor('2', 'TEACHER'))).toEqual([]);
      // Biên tập viên cũng không động vào bài nháp của người khác.
      expect(allowedActions(post('DRAFT', '1'), actor('2', 'EDITOR'))).toEqual([]);
    });

    it('biên tập viên duyệt/từ chối bài chờ duyệt, hẹn giờ/đăng/gỡ/khôi phục', () => {
      const editor = actor('2', 'EDITOR');
      expect(allowedActions(post('PENDING_REVIEW'), editor).sort()).toEqual(
        ['approve', 'reject'].sort(),
      );
      expect(allowedActions(post('SCHEDULED'), editor).sort()).toEqual(
        ['cancel_schedule', 'publish', 'reschedule'].sort(),
      );
      expect(allowedActions(post('PUBLISHED'), editor)).toEqual(['unpublish']);
      expect(allowedActions(post('ARCHIVED'), editor)).toEqual(['restore']);
    });

    it('chỉ ADMIN xóa vĩnh viễn bài đã gỡ', () => {
      expect(allowedActions(post('ARCHIVED'), actor('9', 'ADMIN'))).toContain('delete');
      expect(allowedActions(post('ARCHIVED'), actor('9', 'PRINCIPAL'))).not.toContain(
        'delete',
      );
      expect(allowedActions(post('ARCHIVED'), actor('2', 'EDITOR'))).not.toContain(
        'delete',
      );
    });

    it('học sinh (không có quyền nào) không làm được gì', () => {
      for (const status of POST_STATUSES) {
        expect(allowedActions(post(status), actor('5', 'STUDENT'))).toEqual([]);
      }
    });
  });

  it('bảng luật có đủ mọi thao tác', () => {
    expect(Object.keys(POST_RULES).sort()).toEqual([...POST_ACTIONS].sort());
  });
});
