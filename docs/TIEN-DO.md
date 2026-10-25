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
| [x] | 4 | Website public (F01–F07) | 2026-10-25 |
| [x] | 5 | Công việc, hạn chót, lịch (F14, F15) | 2026-10-25 |
| [x] | 6 | Nhật ký & cấu hình (F16, F17) | 2026-10-25 |
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

### Bước 4 – Website public (F01–F07) (2026-10-25)

- **Đã làm:** API `features/public-site` (`/public/posts` có lọc chuyên mục gồm chuyên mục con, tìm kiếm, phân trang; `/public/posts/:slug` chỉ trả `PUBLISHED`, còn lại 404; `/public/posts/:slug/view` tăng `view_count` 1 lần/IP/30 phút; `/public/admission`, `/public/settings` chỉ các khóa cho phép, `/public/gallery` chỉ ảnh của bài đã đăng) và `features/contacts` (`POST /contacts` công khai: zod, ô ẩn chống bot, 3 lần/10 phút/IP → 429, nội dung làm sạch; quản trị `GET /contacts`, `PATCH /contacts/:id/status` cần `post:approve`, có audit log). Bỏ `GET /posts` công khai cũ (thay bằng `/public/posts`). `RevalidateService` gọi `POST /api/revalidate` của web khi đăng/gỡ bài và sửa chuyên mục.
- Web: header/footer responsive (menu `<details>` trên điện thoại, logo placeholder), trang `/`, `/gioi-thieu`, `/tin-tuc` (lọc, tìm, phân trang), `/tin-tuc/[slug]` (`generateMetadata` + Open Graph + canonical), `/thong-bao`, `/tuyen-sinh`, `/thu-vien`, `/lien-he` (form + bản đồ), `sitemap.xml`, `robots.txt`, route `/api/revalidate` (bí mật dùng chung, `revalidateTag(tag, { expire: 0 })`), admin `/admin/lien-he`. Dữ liệu công khai đọc qua `use cache` + `cacheTag`, API lỗi thì không làm hỏng build (`cacheLife("seconds")`, hiện thông báo lỡ tải). e2e mới `test/public.e2e-spec.ts` (11 test); 23 unit + 57 e2e xanh. Đã chạy thật API + web (`next start`): đủ trang trả 200, bài chưa đăng không lộ nội dung, đăng bài thì `/tin-tuc` cập nhật ngay, gỡ bài thì biến mất, `/api/revalidate` từ chối khi sai bí mật.
- **Lệch thiết kế:** "Thư viện" chỉ có ảnh (chưa có video, văn bản/biểu mẫu tải về — không có bảng). Tin nổi bật/thông báo mới lấy theo chuyên mục seed `tin-tuc`/`thong-bao`; nội dung Giới thiệu/Tuyển sinh viết tĩnh từ mục 1 tài liệu phân tích, thông tin chưa có hiển thị "Đang cập nhật". Số điện thoại/email/bản đồ lấy từ `system_settings` (khóa `school.phone`, `school.email`, `school.map_url`), chưa có màn hình sửa (thuộc bước 6). Ảnh chèn trong bài lưu URL tuyệt đối theo `NEXT_PUBLIC_API_URL`.
- **Kiểm tra bằng Chrome headless (375px):** 8 trang (/, /gioi-thieu, /tin-tuc, /thong-bao, /tuyen-sinh, /thu-vien, /lien-he, một bài) không tràn ngang (scrollWidth = 375); bảng tuyển sinh cuộn ngang trong khung riêng. Phát hiện và sửa 2 lỗi tương phản ở chế độ tối (nút Thông tin tuyển sinh, nút Gửi liên hệ). Đã thử đăng/gỡ bài với REVALIDATE_SECRET thật trong .env: trang /tin-tuc cập nhật ngay.
- **Còn lại:** trang `/tin-tuc/[slug]` của bài không tồn tại/chưa đăng hiện giao diện 404 kèm `noindex` (API trả 404 đúng) nhưng mã HTTP là 200 do nội dung được stream; muốn mã 404 thật phải bỏ prerender một phần của route này. Khung bản đồ nhúng Google chưa xác nhận hiển thị được (không kiểm tra được trong Chrome headless), đã có liên kết mở bản đồ dự phòng. Rate limit vẫn trong bộ nhớ (Redis ở bước 10). `robots.txt` lấy `NEXT_PUBLIC_SITE_URL` lúc build. Cần `REVALIDATE_SECRET` (cùng giá trị) ở `apps/api/.env` và `apps/web/.env.local`; đặt `NEXT_PUBLIC_SITE_URL` khi triển khai (bước 11).

### Bước 5 – Công việc, hạn chót, lịch sự kiện (F14, F15) (2026-10-25)

- **Đã làm:** API `features/tasks`: liệt kê có lọc (người phụ trách, trạng thái, khoảng hạn), xem, tạo/giao, sửa/đổi hạn, xóa (cần `task:assign`), đổi trạng thái (người được giao hoặc người có `task:assign`; DONE ghi `completed_at`, mở lại thì xóa), danh sách nhân sự để giao việc. Người chỉ có `task:read:own` luôn bị ép về việc của mình dù lọc thế nào; việc quá hạn (chưa DONE mà qua `due_at`) tính khi truy vấn, lọc `status=OVERDUE` cũng theo `due_at`. API `features/events`: xem công khai (sắp tới hoặc theo khoảng cho lịch tháng), thêm/sửa/xóa cần `post:approve`, kiểm tra `end_at > start_at` cả khi sửa. Mọi thao tác ghi `audit_logs` (`task.*`, `event.*`); sự kiện đổi thì báo web làm mới cache tag `events`.
- Tool Agent trong `tasks.agent-tools.ts`: `update_task_status`, `create_task`, thêm `list_assignees` (chỉ đọc, để tìm `assigneeId`); quyền do service kiểm tra. Tách `withAudit` ra `agent/with-audit.ts` để test được.
- Web: `/admin/cong-viec` (lọc, giao/sửa/xóa, đổi trạng thái tại chỗ), `/admin/lich` (lịch tháng, danh sách trên điện thoại, thêm/sửa/xóa cho người có quyền), trang công khai `/lich-su-kien` (mục mới trong menu và sitemap), menu admin hiện theo quyền. Seed thêm 2 sự kiện mẫu. e2e mới `test/tasks.e2e-spec.ts` (15 test: quyền, lọc, quá hạn, completed_at, sự kiện, 4 tool agent kể cả bị từ chối và audit log); 23 unit + 72 e2e xanh.
- **Kiểm tra bằng Chrome headless:** đăng nhập BGH thấy cả 3 việc kèm nút Giao/Sửa/Xóa, giáo viên chỉ thấy 2 việc của mình và không có nút giao/sửa; giao việc và tạo sự kiện trên giao diện thành công, sự kiện hiện ngay ở lịch admin và trang công khai; không trang nào tràn ngang ở 375px.
- **Lệch thiết kế:** quyền quản lý sự kiện dùng `post:approve` (như chuyên mục/liên hệ), không thêm quyền mới. Danh sách việc giới hạn 200 bản ghi, chưa phân trang. Tool agent `create_task`/`update_task_status` chưa cần xác nhận 2 bước (bước 9 quyết định cho các thao tác nhạy cảm).
- **Còn lại:** tự cập nhật status `OVERDUE` định kỳ và nhắc hạn (bước 7).

### Bước 6 – Nhật ký hoạt động & cấu hình hệ thống (F16, F17) (2026-10-25)

- **Đã làm:** API `GET /audit-logs` (lọc theo người dùng, kênh web/telegram/scheduler, action chứa chuỗi, khoảng thời gian; phân trang theo con trỏ `nextCursor` theo id giảm dần; kèm tên người dùng, IP, payload JSON) và `GET /audit-logs/filters` — chỉ người có `system:read` (ADMIN, BGH). API `GET/PATCH /settings`: danh sách khóa cho phép và schema zod từng khóa (`SETTING_KEYS`, `SETTING_META` trong `@pvh/shared`; schema ở `features/settings/dto`): tên trường, địa chỉ, điện thoại, email, liên kết bản đồ (https), giờ báo cáo ngày (HH:mm), giờ nhắc trước hạn (1–168). Xem: `system:read`; sửa: quyền mới `setting:manage` chỉ ADMIN. Khóa lạ (kể cả tên giống bí mật như `anthropic.api_key`) bị từ chối cả yêu cầu; chuỗi rỗng xóa khóa optional; ghi audit `setting.update` kèm giá trị cũ/mới và IP; báo web làm mới cache tag `settings`. `GET /system/dashboard`: bài chờ duyệt, bài hẹn giờ, liên hệ mới (cần `post:approve`), việc quá hạn (toàn trường nếu `task:read:all`, của mình nếu `task:read:own`), tình trạng hệ thống (cần `system:read`). Các thao tác qua web đều đã truyền IP vào `audit_logs` (kiểm tra bằng e2e).
- Web: `/admin/nhat-ky` (bộ lọc, bảng, xem payload JSON, "Tải thêm"), `/admin/cau-hinh` (ADMIN sửa, BGH chỉ xem), `/admin` có thẻ thống kê + tình trạng hệ thống + hạn chót; menu theo quyền; menu admin tự xuống dòng trên điện thoại (trước đó 11 mục làm trang tràn ngang). ADMIN không bỏ được `user:manage` và `setting:manage` khỏi vai trò của mình. e2e mới `test/admin.e2e-spec.ts` (10 test: quyền, lọc, phân trang con trỏ, IP, cấu hình hợp lệ/sai/khóa lạ, dashboard theo quyền và đổi theo dữ liệu); 23 unit + 82 e2e xanh.
- **Kiểm tra bằng Chrome headless:** ADMIN thấy đủ mục và sửa được cấu hình (sai số điện thoại báo lỗi, đúng thì lưu và hiện ngay ở trang Liên hệ công khai); BGH vào được nhật ký, cấu hình chỉ xem; biên tập viên không thấy mục và gõ thẳng URL thì bị báo thiếu quyền; lọc nhật ký theo action thấy payload và IP, "Tải thêm" 30 → 60 dòng; dashboard khớp số liệu CSDL; mọi trang admin vừa 375px.
- **Lệch thiết kế:** thêm quyền `setting:manage` (ADMIN; đã đồng bộ vào seed và ma trận vai trò). BGH được xem cấu hình (không sửa). Bộ lọc action là "chứa chuỗi", không phải khớp chính xác. Các khóa `report.daily_time` và `reminder.hours_before` mới chỉ lưu; bước 7 sẽ dùng.
- **Còn lại:** bước 7 đọc `report.daily_time`/`reminder.hours_before`. Chưa có xuất nhật ký ra file và chưa tự xóa nhật ký cũ.
