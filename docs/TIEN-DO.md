# Tiến độ phát triển PVH-EduAgent

Cập nhật tự động bởi lệnh `/buoc` của Claude Code (yêu cầu chi tiết từng bước: `.claude/skills/buoc/steps/`).

- `/buoc tiep` – làm bước kế tiếp chưa xong
- `/buoc <số>` – làm đúng bước đó
- `/buoc tiendo` – xem tiến độ, không sửa gì

## Đã có trước lộ trình

- Monorepo pnpm: Next.js 16 (`apps/web`), NestJS 12 (`apps/api`), `packages/shared`; cấu trúc feature-based.
- AI Agent bằng Claude Agent SDK: `POST /api/agent/chat`, tool `list_posts`, `create_post_draft`, `check_deadlines`, `get_system_status`; tool nào cũng kiểm tra quyền và ghi audit log.
- PostgreSQL 18 + Prisma 7: 17 bảng theo ERD, migration `init`, seed dữ liệu mẫu (docs/02-huong-dan-postgresql.md).
- Xác thực tạm qua header `x-dev-user-email` (DevAuthGuard) – đã thay bằng JWT ở bước 1.

## Lộ trình

| | Bước | Nội dung | Ngày xong |
|---|---|---|---|
| [x] | 0 | Ghi quy ước dự án vào CLAUDE.md | 2026-10-22 |
| [x] | 1 | Đăng nhập JWT (F10) | 2026-10-22 |
| [x] | 2 | Người dùng & phân quyền (F11) | 2026-10-25 |
| [x] | 3 | Quy trình bài viết, chuyên mục, media (F12, F13) | 2026-10-25 |
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

### Bước 1 – Đăng nhập JWT (F10) (2026-10-22)

- **Đã làm:** API `features/auth`: login/refresh/logout/me/change-password/forgot-password/reset-password; access JWT 15 phút (jose) + refresh token 7 ngày trong cookie httpOnly, lưu băm ở bảng mới `refresh_tokens`, dùng một lần; `JwtAuthGuard` toàn cục thay `DevAuthGuard` (header dev chỉ khi `NODE_ENV=development` + `DEV_AUTH=true`); chặn 5 lần sai/phút theo IP + email; audit log đăng nhập/đăng xuất/đổi mật khẩu.
- Web: `src/proxy.ts` chặn `/admin` và tự refresh; trang `/dang-nhap`, `/quen-mat-khau`, `/dat-lai-mat-khau`, `/admin/doi-mat-khau`; tên + vai trò + nút đăng xuất ở sidebar; `serverApi` chuyển tiếp cookie cho Server Component. e2e: 17 test (login, me, refresh, thu hồi, 401, 429, đổi mật khẩu).
- **Lệch thiết kế:** thêm bảng `refresh_tokens` ngoài ERD (ghi ở docs/02). Token đặt lại mật khẩu là JWT gắn dấu vân tay `password_hash` thay vì bảng riêng. Dùng lại refresh token đã thu hồi sau 10 giây ân hạn → thu hồi mọi phiên của tài khoản. Rate limit lưu trong bộ nhớ (1 instance).
- **Còn lại:** gửi email đặt lại mật khẩu (hiện in link ra log API). Rate limit dùng Redis khi chạy nhiều instance, `trust proxy` cho IP thật sau reverse proxy (bước 10/11). Web và API phải cùng tên miền gốc khi triển khai (bước 11).

### Bước 2 – Người dùng & phân quyền (F11) (2026-10-25)

- **Đã làm:** quyền mới `user:manage` (chỉ ADMIN; BGH không có) trong `@pvh/shared` + seed. API `features/users` (liệt kê phân trang/tìm theo tên-email/lọc trạng thái-vai trò, tạo, sửa + gán nhiều vai trò, khóa/mở khóa, đặt lại mật khẩu) và `features/roles` (xem ma trận, sửa quyền vai trò); kiểm tra quyền trong service, mọi thao tác ghi `audit_logs` (`user.create|update|lock|unlock|reset_password`, `role.update_permissions`). Khóa hoặc đặt lại mật khẩu thì thu hồi mọi refresh token; tài khoản khóa không đăng nhập được và phiên đang mở bị 401 ngay.
- Web: `/admin/nguoi-dung` (bảng, bộ lọc, phân trang, form tạo/sửa, khóa, đặt lại mật khẩu), `/admin/vai-tro` (ma trận checkbox), menu admin ẩn mục không đủ quyền (`AdminNav`). Chuyển `form-styles` sang `shared/ui`. AI Agent không có tool nào cho phần này. e2e mới `test/users.e2e-spec.ts` (403 cho BGH/giáo viên, khóa tài khoản, ADMIN cuối cùng, tự khóa, sửa quyền vai trò, audit log).
- **Lệch thiết kế:** không có bảng/migration mới. "Không cho xóa ADMIN cuối cùng" áp dụng cho khóa và gỡ vai trò ADMIN (chưa có API xóa người dùng). ADMIN luôn giữ `user:manage` (không gỡ được). Seed đồng bộ lại quyền vai trò theo `@pvh/shared`, nên chạy lại seed sẽ ghi đè quyền đã sửa trên web.
- **Còn lại:** giao diện web mới kiểm tra qua build/lint, chưa thao tác bằng trình duyệt. Người dùng đã bị khóa vẫn còn trong danh sách (chưa có xóa hẳn).

### Bước 3 – Quy trình bài viết, chuyên mục, media (F12, F13) (2026-10-25)

- **Đã làm:** `features/posts/posts.state-machine.ts` gom luật chuyển trạng thái (DRAFT → PENDING_REVIEW → REJECTED | SCHEDULED | PUBLISHED → ARCHIVED, cộng dời lịch, hủy lịch, khôi phục, xóa nháp/xóa vĩnh viễn) + 23 unit test phủ mọi cạnh và mọi cặp sai luật. `PostsService` kiểm tra quyền trong service (tác giả sửa DRAFT/REJECTED, `post:approve`, `post:schedule`, `post:unpublish`, xóa vĩnh viễn chỉ ADMIN), cập nhật có điều kiện theo trạng thái (chống thao tác đồng thời), ghi `reviewer_id`, `published_at`, `reject_reason`, `audit_logs` (`post.*`). HTML lọc XSS phía server bằng `sanitize-html` (allowlist thẻ, chặn script/on*/javascript:/iframe/style). `features/categories` (CRUD cây cha–con, `sort_order`, chặn vòng lặp, không xóa khi còn con) và `features/media` (upload multipart, tối đa 5 MB, chỉ JPEG/PNG/WebP/GIF nhận dạng theo magic bytes + khớp Content-Type, không nhận SVG; lưu `uploads/`, bảng `media`, phục vụ ảnh công khai ở `GET /media/files/:tên`). `PostDto` thêm tác giả, chuyên mục, ảnh đại diện, lý do từ chối và `actions` (thao tác được phép theo quyền + trạng thái) để giao diện hiện đúng nút.
- Web: `/admin/bai-viet` (lọc theo trạng thái/chuyên mục), `/admin/bai-viet/moi`, `/admin/bai-viet/[id]` (soạn bằng Tiptap, chọn ảnh đại diện/chèn ảnh từ thư viện, các nút duyệt/từ chối/hẹn giờ/dời lịch/đăng/gỡ/khôi phục/xóa theo `actions`), `/admin/chuyen-muc`; menu ẩn mục không đủ quyền. e2e mới `test/posts.e2e-spec.ts` (15 test); e2e chạy tuần tự (`fileParallelism: false`) vì test đổi mật khẩu/quyền dùng chung tài khoản seed; `pnpm test` chạy cả unit lẫn e2e.
- **Kết quả:** `pnpm build`, `pnpm lint`, `pnpm test` (23 unit + 46 e2e) xanh.
- **Lệch thiết kế:** quản lý chuyên mục dùng quyền `post:approve` (không thêm quyền mới); duyệt cần cả `post:approve` lẫn `post:schedule`; người không có `post:approve` chỉ thấy bài của mình trong danh sách quản lý (ảnh hưởng cả tool `list_posts` của Agent). Ảnh chèn trong nội dung lưu URL tuyệt đối theo `NEXT_PUBLIC_API_URL` lúc soạn; ảnh đại diện lưu đường dẫn tương đối.
- **Còn lại:** mục "Giao diện … dùng được với từng vai trò seed" **chưa kiểm tra bằng trình duyệt** (mới qua build/lint) nhưng đã đánh `[x]` theo xác nhận của người dùng; vẫn nên thử tay trình soạn thảo, tải ảnh, từng nút theo vai trò. Đăng bài tự động khi đến giờ thuộc bước 7; hiển thị bài công khai (kể cả ảnh) thuộc bước 4.
