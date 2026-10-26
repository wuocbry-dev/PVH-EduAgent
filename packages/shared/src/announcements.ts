// Thông báo theo đối tượng và hộp thông báo trong cổng (bước 20).

// Đối tượng của thông báo/sự kiện: toàn trường, một khối, một lớp, hoặc chỉ nhân sự (học sinh không thấy).
export const AUDIENCES = ['SCHOOL', 'GRADE', 'CLASS', 'TEACHERS'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const AUDIENCE_NAMES: Record<Audience, string> = {
  SCHOOL: 'Toàn trường',
  GRADE: 'Một khối',
  CLASS: 'Một lớp',
  TEACHERS: 'Chỉ giáo viên, nhân sự',
};

export function audienceLabel(audience: Audience, gradeLevel: number | null, className: string | null): string {
  if (audience === 'GRADE') return `Khối ${gradeLevel ?? ''}`.trim();
  if (audience === 'CLASS') return `Lớp ${className ?? ''}`.trim();
  return AUDIENCE_NAMES[audience];
}

export const ANNOUNCEMENT_TITLE_MAX = 200;
export const ANNOUNCEMENT_CONTENT_MAX = 20_000;
// Số thông báo một người được gửi trong một giờ.
export const ANNOUNCEMENTS_PER_HOUR = 20;

export interface AnnouncementDto {
  id: string;
  title: string;
  content: string; // HTML đã làm sạch
  audience: Audience;
  gradeLevel: number | null;
  classId: string | null;
  className: string | null;
  audienceLabel: string;
  pinned: boolean;
  expiresAt: string | null;
  createdAt: string;
  createdById: string;
  createdByName: string;
  readCount: number; // số người đã đọc (chỉ có ý nghĩa với người gửi)
}

// Một mục trong hộp thông báo: thông báo do người gửi soạn, hoặc thông báo hệ thống tự sinh (bảng notifications:
// thời khoá biểu đổi, có điểm mới — không kèm giá trị điểm, nhắc việc…).
export interface InboxItemDto {
  kind: 'ANNOUNCEMENT' | 'NOTIFICATION';
  id: string;
  title: string;
  body: string; // ANNOUNCEMENT: HTML đã làm sạch; NOTIFICATION: văn bản thường
  createdAt: string;
  read: boolean;
  pinned: boolean;
  audienceLabel: string | null;
  senderName: string | null;
}

export interface InboxDto {
  items: InboxItemDto[];
  unread: number;
}

// Các đối tượng người dùng được gửi thông báo (hoặc đặt cho sự kiện).
export interface AudienceTargetsDto {
  manageAll: boolean; // BGH: mọi đối tượng; giáo viên: chỉ các lớp mình dạy/chủ nhiệm
  grades: number[];
  classes: { id: string; name: string; gradeLevel: number; homeroom: boolean }[];
}

export interface CreateAnnouncementRequest {
  title: string;
  content: string;
  audience: Audience;
  gradeLevel?: number | null;
  classId?: string | null;
  pinned?: boolean;
  expiresAt?: string | null;
}
