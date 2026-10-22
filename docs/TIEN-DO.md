# Tiến độ phát triển PVH-EduAgent

Cập nhật tự động bởi lệnh `/buoc` của Claude Code (yêu cầu chi tiết từng bước: `.claude/skills/buoc/steps/`).

- `/buoc tiep` – làm bước kế tiếp chưa xong
- `/buoc <số>` – làm đúng bước đó
- `/buoc tiendo` – xem tiến độ, không sửa gì

## Đã có trước lộ trình

- Monorepo pnpm: Next.js 16 (`apps/web`), NestJS 12 (`apps/api`), `packages/shared`; cấu trúc feature-based.
- AI Agent bằng Claude Agent SDK: `POST /api/agent/chat`, tool `list_posts`, `create_post_draft`, `check_deadlines`, `get_system_status`; tool nào cũng kiểm tra quyền và ghi audit log.
- PostgreSQL 18 + Prisma 7: 17 bảng theo ERD, migration `init`, seed dữ liệu mẫu (docs/02-huong-dan-postgresql.md).
- Xác thực tạm qua header `x-dev-user-email` (DevAuthGuard).

## Lộ trình

| | Bước | Nội dung | Ngày xong |
|---|---|---|---|
| [x] | 0 | Ghi quy ước dự án vào CLAUDE.md | 2026-10-22 |
| [ ] | 1 | Đăng nhập JWT (F10) | |
| [ ] | 2 | Người dùng & phân quyền (F11) | |
| [ ] | 3 | Quy trình bài viết, chuyên mục, media (F12, F13) | |
| [ ] | 4 | Website public (F01–F07) | |
| [ ] | 5 | Công việc, hạn chót, lịch (F14, F15) | |
| [ ] | 6 | Nhật ký & cấu hình (F16, F17) | |
| [ ] | 7 | Bộ lập lịch Redis + BullMQ (A05, A06, A09) | |
| [ ] | 8 | Bot Telegram & liên kết tài khoản (A01–A04) | |
| [ ] | 9 | Xác nhận 2 bước cho AI Agent (A07, A08) | |
| [ ] | 10 | Bảo mật & chất lượng | |
| [ ] | 11 | Đóng gói & triển khai | |
| [ ] | 12 | Đối chiếu tài liệu đồ án | |

## Nhật ký từng bước

<!-- Mỗi bước thêm một mục: ### Bước N – tên (YYYY-MM-DD) / Đã làm / Lệch thiết kế / Còn lại -->

### Bước 0 – Ghi quy ước dự án vào CLAUDE.md (2026-10-22)

- **Đã làm:** tạo `CLAUDE.md` (58 dòng) ghi quy ước monorepo, feature-based, zod + `assertPermission` trong service, Prisma 7/BigInt/migration, AI Agent tool + xác nhận 2 bước, audit log, múi giờ, lệnh kiểm tra, lộ trình `/buoc`, quy tắc git. Không sửa code.
- **Lệch thiết kế:** không có.
- **Còn lại:** không.
