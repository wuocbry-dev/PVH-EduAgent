# Đối chiếu chức năng với tài liệu đồ án (bước 23)

So sánh yêu cầu ở `docs/01-phan-tich-de-tai.md` (mục 4: F01–F17, A01–A09; mục 5: phân quyền) và các chức năng mở rộng (bước 14–22) với mã nguồn hiện tại. Dùng cho chương "Kết quả thực hiện" của báo cáo.

- **Trạng thái:** **Đủ** = làm hết yêu cầu, có test; **Một phần** = làm được phần chính, phần thiếu ghi ở cột lệch; **Chưa** = chưa làm.
- **Code:** API ở `apps/api/src/features/<tên>`, giao diện ở `apps/web/src/features/<tên>` và các trang trong `apps/web/src/app`.
- **Test:** tên file trong `apps/api/test/` (e2e, cần PostgreSQL + Redis) hoặc `*.spec.ts` (unit).
- **Sơ đồ:** file trong `docs/diagrams/drawio/`.
- **Số liệu tại thời điểm viết:** 218 unit test + 364 e2e test xanh, 205 endpoint, 59 bảng CSDL.

## 1. Phân hệ Website công khai

| Mã | Chức năng | Trạng thái | Code (API / trang) | Test chứng minh | Sơ đồ | Lệch so với thiết kế |
|---|---|---|---|---|---|---|
| F01 | Trang chủ: banner, tin nổi bật, thông báo mới | Đủ | `public-site`, `posts` / `/` | `public.e2e-spec.ts` | 02 | Tin nổi bật, thông báo mới lấy theo chuyên mục `tin-tuc` / `thong-bao` |
| F02 | Giới thiệu | Đủ | `site` / `/gioi-thieu` | (trang tĩnh) | 02 | Nội dung viết tĩnh từ mục 1 tài liệu phân tích; thông tin chưa xác minh hiện "Đang cập nhật" |
| F03 | Tin tức – sự kiện theo chuyên mục, tìm kiếm | Đủ | `public-site` (`q`, chuyên mục) / `/tin-tuc` | `public.e2e-spec.ts` | 02 | – |
| F04 | Thông báo | Đủ | `public-site` / `/thong-bao`; thông báo theo đối tượng trong cổng: `announcements` | `public.e2e-spec.ts`, `announcements.e2e-spec.ts` | 02 | Thêm thông báo theo lớp/khối/nhân sự trong cổng (bước 20) |
| F05 | Tuyển sinh lớp 10 | Đủ | `public-site` (`admission_stats`) / `/tuyen-sinh` | `public.e2e-spec.ts` | 02 | – |
| F06 | Thư viện ảnh/video, văn bản – biểu mẫu tải về | Đủ (lệch) | `public-site` (thư viện ảnh), `library` / `/thu-vien/anh`, `/thu-vien` | `public.e2e-spec.ts`, `library.e2e-spec.ts` | 02 | Thư viện ảnh lấy ảnh trong bài đã đăng. Video, văn bản, biểu mẫu nằm trong **thư viện số** (bước 21: PDF, MP3, MP4/WebM, tải về khi tài liệu cho phép, có nguồn và giấy phép). Không có bảng "văn bản" riêng |
| F07 | Liên hệ, bản đồ | Đủ | `contacts`, `settings` / `/lien-he` | `public.e2e-spec.ts` (chống bot, giới hạn 3 lần/10 phút) | 02 | Khung bản đồ nhúng chưa kiểm được trong trình duyệt headless; có liên kết mở bản đồ dự phòng |

## 2. Phân hệ Quản trị (CMS)

| Mã | Chức năng | Trạng thái | Code (API / trang) | Test chứng minh | Sơ đồ | Lệch so với thiết kế |
|---|---|---|---|---|---|---|
| F10 | Đăng nhập, quên mật khẩu, đổi mật khẩu | Đủ | `auth`, `activation` / `/dang-nhap`, `/kich-hoat`, `/quen-mat-khau`, `…/doi-mat-khau` | `app.e2e-spec.ts`, `roster.e2e-spec.ts`, `security.e2e-spec.ts` | 09 | JWT trong cookie HttpOnly + refresh token xoay vòng (bảng `refresh_tokens` ngoài ERD). Đăng nhập bằng email **hoặc** mã học sinh/giáo viên. Email đặt lại mật khẩu chưa gửi thật (in liên kết ra log API) |
| F11 | Người dùng & phân quyền RBAC | Đủ | `users`, `roles`, `roster` / `/admin/nguoi-dung`, `/admin/vai-tro`, `/admin/nhap-danh-sach` | `users.e2e-spec.ts`, `role-matrix.e2e-spec.ts`, `permissions.spec.ts` | 16, 17 | Thêm vai trò STUDENT, LIBRARIAN; tạo tài khoản hàng loạt từ Excel kèm mã kích hoạt. Ma trận quyền ở `docs/04` |
| F12 | Bài viết: nháp → chờ duyệt → hẹn giờ → đăng → lưu trữ | Đủ | `posts` (`posts.state-machine.ts`) / `…/bai-viet` | `posts.e2e-spec.ts`, `posts.state-machine.spec.ts` | 05, 11, 12, 21 | Không có trạng thái "đã duyệt" riêng: duyệt dẫn thẳng tới "đã hẹn giờ" hoặc "đã đăng" |
| F13 | Chuyên mục, thẻ, media | Một phần | `categories`, `media` / `…/chuyen-muc`, thư viện media trong trình soạn | `posts.e2e-spec.ts`, `media.e2e-spec.ts` | 17 | **Chưa có thẻ (tag)**. Media đi qua R2/local, nhận dạng bằng magic bytes |
| F14 | Công việc & hạn chót | Đủ | `tasks` / `/bgh/cong-viec`, `/giao-vien/cong-viec` | `tasks.e2e-spec.ts` | 08, 15 | Danh sách tối đa 200 việc, chưa phân trang |
| F15 | Lịch sự kiện | Đủ | `events` / `/lich-su-kien`, `…/lich` | `public.e2e-spec.ts`, `announcements.e2e-spec.ts` | 02 | Sự kiện có đối tượng (toàn trường, khối, lớp, nhân sự); quyền quản lý dùng `post:approve` |
| F16 | Nhật ký hoạt động | Đủ | `audit-log` / `/admin/nhat-ky` | `admin.e2e-spec.ts`, `security.e2e-spec.ts` (quét bí mật) | 16, 17 | Chưa xuất file, chưa tự xoá nhật ký cũ |
| F17 | Cấu hình hệ thống | Đủ | `settings` / `/admin/cau-hinh` | `admin.e2e-spec.ts` | 17 | Thêm quyền `setting:manage` (chỉ ADMIN sửa; BGH chỉ xem) |

## 3. Phân hệ AI Agent + Telegram

| Mã | Chức năng | Trạng thái | Code | Test chứng minh | Sơ đồ | Lệch so với thiết kế |
|---|---|---|---|---|---|---|
| A01 | Liên kết Telegram bằng mã một lần | Đủ | `telegram` / `…/tai-khoan` | `telegram.e2e-spec.ts` | 04, 10 | Nhận cả `/link <mã>` và `/start <mã>` (deep-link); khoá tạm sau 5 lần sai |
| A02 | Chat ngôn ngữ tự nhiên tiếng Việt | Đủ | `agent` (Claude Agent SDK, chỉ tool nghiệp vụ), `telegram` / `…/tro-ly-ai` | `agent-actions.e2e-spec.ts`, `telegram.e2e-spec.ts`, `telegram-post.e2e-spec.ts` | 03, 07, 14 | Có cả trên web (Trợ lý AI trong cổng) |
| A03 | Kiểm tra hệ thống `/status` | Đủ | `system` (tool `get_system_status`) | `telegram.e2e-spec.ts`, `admin.e2e-spec.ts` | 15 | – |
| A04 | Kiểm tra hạn chót `/deadline` | Đủ | `tasks` (tool `check_deadlines`) | `telegram.e2e-spec.ts`, `tasks.e2e-spec.ts` | 15 | – |
| A05 | Tự động đăng bài khi đến hạn | Đủ | `scheduler` (BullMQ) | `scheduler.e2e-spec.ts` | 06, 13 | Lỗi sau hết lượt thử thì báo ADMIN |
| A06 | Nhắc hạn chủ động | Đủ | `scheduler`, `notifications` | `scheduler.e2e-spec.ts` | 08 | Mốc nhắc theo cấu hình `reminder.hours_before` |
| A07 | Thực thi tác vụ (tạo nháp, lên lịch, đổi trạng thái task, tạo thông báo, tóm tắt) | Đủ | `*.agent-tools.ts` trong `posts`, `tasks`, `system`, `timetable`, `library` | `agent-actions.e2e-spec.ts`, `telegram-post.e2e-spec.ts` | 07, 14 | Thêm tạo bài kèm ảnh/video từ Telegram (bước 12), tra thời khoá biểu, tìm thư viện số |
| A08 | Xác nhận 2 bước | Đủ | `agent-actions` (bảng `agent_actions`, hết hạn 10 phút) | `agent-actions.e2e-spec.ts`, `telegram-review.e2e-spec.ts` | 12, 14 | Xác nhận được trên kênh khác với kênh ra lệnh (luôn đúng người tạo) |
| A09 | Báo cáo định kỳ | Đủ | `scheduler` (`daily-report.processor.ts`) | `scheduler.e2e-spec.ts` | 08 | Gửi người có `system:read` (ADMIN, BGH) |

## 4. Chức năng mở rộng (bước 13–22)

| Bước | Chức năng | Trạng thái | Code (API / trang) | Test chứng minh | Lệch / ghi chú |
|---|---|---|---|---|---|
| 13 | Telegram báo người duyệt khi có bài gửi duyệt | Đủ | `telegram` (`telegram-review.service.ts`) | `telegram-review.e2e-spec.ts` | Từ bước 23 ADMIN không còn nhận (không có quyền duyệt) |
| 14 | Học vụ (năm học, học kỳ, khối, lớp, môn, tổ, phòng), tài khoản hàng loạt, mã kích hoạt | Đủ | `academic`, `roster`, `activation` / `/bgh/hoc-vu`, `/admin/nhap-danh-sach`, `/kich-hoat` | `academic.e2e-spec.ts`, `roster.e2e-spec.ts` | Chỉ lưu dữ liệu học sinh tối thiểu; mã kích hoạt chỉ lưu HMAC |
| 15 | Cổng theo vai trò | Đủ | `packages/shared/src/portals.ts`, `apps/web/src/proxy.ts` / `/admin`, `/bgh`, `/bien-tap`, `/thu-thu`, `/giao-vien`, `/hoc-sinh` | `portals.e2e-spec.ts`, `portals.spec.ts` | Claim `roles` trong token chỉ để chọn cổng |
| 16 | Phân công giảng dạy | Đủ | `teaching` / `/bgh/phan-cong`, `/admin/phan-cong` | `teaching.e2e-spec.ts`, `teaching-summary.spec.ts` | Định mức và phân công seed là **mẫu** |
| 17 | Thời khoá biểu | Đủ | `timetable` / `…/thoi-khoa-bieu` | `timetable.e2e-spec.ts` | Chặn trùng giáo viên/lớp/phòng ở CSDL; từ bước 23 không xoá được phòng đang được xếp |
| 18 | Đợt thi có mã, nhập điểm | Đủ | `scores` / `/giao-vien/nhap-diem`, `/bgh/diem` | `scores.e2e-spec.ts`, `scores.spec.ts` | Ảnh biên bản chấm chưa làm (chờ dùng kho riêng tư) |
| 19 | Xem điểm, thống kê, khoá sổ, điều chỉnh | Đủ | `scores` (`score-views`, `score-calendar`, `score-adjustments`) / `…/so-diem`, `/hoc-sinh/diem` | `score-views.e2e-spec.ts`, `score-average.spec.ts` | ĐTB luôn tính lại theo Thông tư 22/2021, không lưu bảng ĐTB |
| 20 | Cổng học sinh, thông báo theo lớp/khối | Đủ | `announcements`, `events` / `/hoc-sinh/*`, `…/thong-bao` | `announcements.e2e-spec.ts` | – |
| 21 | Thư viện số (kho riêng tư) | Đủ | `library`, `infrastructure/storage` (private) / `/thu-vien`, `/thu-thu/*`, `…/tu-sach` | `library.e2e-spec.ts` | Đã thử với bucket R2 riêng tư thật |
| 22 | Trắc nghiệm ôn tập | Đủ | `quizzes` / `…/trac-nghiem` | `quizzes.e2e-spec.ts`, `quiz.spec.ts` | Không tính vào điểm học tập; không có tool AI Agent |
| 23 | Rà soát bảo mật, ma trận quyền | Đủ | `test/routes.ts`, `test/role-matrix.e2e-spec.ts` | `role-matrix.e2e-spec.ts`, `security.e2e-spec.ts` | Xem mục 6 |
| 24, 25 | Mượn trả sách giấy, tự động xếp thời khoá biểu | Chưa (đã bỏ khỏi lộ trình) | – | – | Tuỳ chọn |

## 5. Phân quyền (mục 5 tài liệu phân tích)

Ma trận đầy đủ vai trò × quyền, cùng giáo viên chủ nhiệm, ở `docs/04-bang-endpoint-quyen.md`. Khác so với bảng ở mục 5:

- **ADMIN** chỉ còn quyền hệ thống: người dùng, cấu hình, nhật ký, học vụ, nhập danh sách, xem phân công và thời khoá biểu. Không còn quyền duyệt/đăng/gỡ bài và giao việc (quyết định ở bước 23). ADMIN vẫn **xoá vĩnh viễn** được bài đã gỡ.
- **BGH và biên tập viên** cùng duyệt, hẹn giờ và gỡ bài, đúng như mục 5.
- **Agent không có quyền riêng**, kế thừa đúng quyền của người đã liên kết. Không có tool nào cho người dùng/phân quyền/cấu hình hay cho điểm số. Học sinh không có trợ lý AI và không liên kết Telegram.
- **Dữ liệu cá nhân học sinh không đi qua Telegram/Agent:** test trong `security.e2e-spec.ts` quét mã nguồn agent/telegram và danh sách tool.
- **Vai trò mới:** học sinh (STUDENT), thủ thư (LIBRARIAN). Giáo viên chủ nhiệm suy từ lớp, không phải vai trò.

## 6. Kết quả rà soát bảo mật (bước 23)

| Hạng mục | Kết quả | Bằng chứng |
|---|---|---|
| Mọi endpoint × mọi vai trò | 205 endpoint × 6 vai trò: thiếu quyền → đúng 403, có quyền → không bị chặn, không 5xx | `role-matrix.e2e-spec.ts` |
| Dò id khi không có quyền | **Đã sửa:** bài viết (chuyển trạng thái, xoá), đổi trạng thái công việc, danh sách học sinh của lớp, nhập điểm (lưu, mẫu, xem trước, xác nhận), xác nhận nhập trắc nghiệm. Các chỗ này tìm bản ghi trước rồi mới kiểm quyền, nên người không có quyền nhận 404 hay 403 tuỳ id có tồn tại hay không. Nay kiểm quyền trước | `role-matrix.e2e-spec.ts` |
| Dữ liệu điểm | ADMIN không có quyền điểm; Agent và Telegram không chạm bảng điểm; audit không ghi giá trị điểm; học sinh chỉ xem điểm của mình | `permissions.spec.ts`, `security.e2e-spec.ts`, `scores.e2e-spec.ts`, `score-views.e2e-spec.ts` |
| Bí mật trong dữ liệu lưu | Quét toàn bộ `audit_logs`, `notifications`, `agent_actions`: không có URL ký sẵn, token bot, khoá R2/JWT, mật khẩu, mã kích hoạt. Nhật ký truy cập HTTP bỏ query string; lỗi grammY không chứa token | `security.e2e-spec.ts` |
| Đăng nhập | **Đã thêm** khoá theo IP: 30 lần sai/10 phút, cộng mọi tài khoản, chống thử một mật khẩu trên nhiều mã học sinh. Ngoài ra vẫn khoá 5 lần sai/phút theo cặp IP + tài khoản | `app.e2e-spec.ts` |
| Kích hoạt, nhập điểm, mở tài liệu | Đã có giới hạn: kích hoạt theo mã và IP; ghi điểm 120/phút; cấp URL đọc 30/phút | `roster.e2e-spec.ts`, `scores.e2e-spec.ts`, `library.e2e-spec.ts` |
| Excel | Giới hạn 2 MB, giới hạn số dòng, kiểm tra dung lượng sau giải nén zip, không đánh giá công thức; mọi ô xuất qua `safeCell` | `roster.e2e-spec.ts`, `scores.e2e-spec.ts`, `timetable.e2e-spec.ts` |
| Kho riêng tư | Không phục vụ tĩnh. URL đọc chỉ cấp sau khi kiểm đối tượng xem: R2 ký sẵn 5 phút, hoặc token HMAC gắn khoá object với driver local | `library.e2e-spec.ts` |
| Toàn vẹn dữ liệu | **Đã sửa:** xoá phòng đang được xếp trong thời khoá biểu làm các tiết mất phòng (khoá ngoại `SET NULL`). Nay báo 409 | `timetable.e2e-spec.ts` |
| Giao diện các cổng | 66 trang (6 cổng với tài khoản seed và các trang công khai) ở 375 px và 1280 px, sáng và tối: không lỗi console/JS, không trang lỗi, nền tối đúng. **Đã sửa:** khung cổng thiếu `min-w-0`, làm bảng rộng đẩy cả trang tràn ngang ở màn rộng | Chrome headless (thủ công, bước 23) |
| Thư viện phụ thuộc (`pnpm audit`) | Hết lỗi cao/nghiêm trọng: nâng `@nestjs/*` 12.3.2 (multer 2.5.0), ép `body-parser` ≥ 2.4.0 và `fast-uri` ≥ 3.1.9, gỡ `@nestjs/mau` (không dùng; kéo theo `undici`, `tmp` cũ). Còn 1 lỗi mức trung bình ở `uuid` < 11.1.1 (qua `exceljs`): chỉ ảnh hưởng `v3/v5/v6` khi truyền `buf`, exceljs chỉ dùng `v4` | `pnpm audit` |

## 7. Bảng CSDL so với ERD (`docs/diagrams/drawio/17-ERD.drawio`)

ERD gốc có **17 bảng**: `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `posts`, `categories`, `media`, `events`, `admission_stats`, `contacts`, `tasks`, `task_reminders`, `system_settings`, `notifications`, `agent_actions`, `audit_logs`. CSDL hiện có **59 bảng**. **42 bảng mới** cần bổ sung vào sơ đồ cho báo cáo (mình không tự sửa file `.drawio`):

| Nhóm (bước) | Bảng mới |
|---|---|
| Xác thực (1) | `refresh_tokens` |
| Học vụ, tài khoản (14) | `school_years`, `semesters`, `grades`, `departments`, `subjects`, `rooms`, `classes`, `teacher_profiles`, `student_profiles`, `class_enrollments`, `activation_codes` |
| Phân công giảng dạy (16) | `subject_period_quotas`, `class_period_quotas`, `teaching_assignments` |
| Thời khoá biểu (17) | `timetables`, `timetable_slots`, `fixed_periods`, `teacher_unavailability` |
| Đợt thi, điểm (18–19) | `assessments`, `assessment_classes`, `scores`, `score_history`, `score_deadlines`, `score_locks`, `score_adjustments` |
| Thông báo theo đối tượng (20) | `announcements`, `announcement_reads` |
| Thư viện số (21) | `library_categories`, `library_items`, `library_item_classes`, `library_favorites`, `library_reading_progress`, `library_views` |
| Trắc nghiệm ôn tập (22) | `quizzes`, `quiz_classes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `quiz_answers` |

Bảng cũ có thêm cột:
- `users`: `phone`, trạng thái `PENDING`, `email` có thể rỗng (mã học sinh/giáo viên nằm ở `student_profiles` / `teacher_profiles`);
- `events`: đối tượng `audience`, khối/lớp;
- `posts`: `source` (`WEB` / `TELEGRAM`).

Chi tiết cột, ràng buộc và index ở `docs/02-huong-dan-postgresql.md`.

**Sơ đồ khác nên cập nhật:**
- Use case tổng quát (02): thêm tác nhân Học sinh, Thủ thư và các use case học vụ, điểm, thời khoá biểu, thư viện, trắc nghiệm.
- Class (16) và Package (18): thêm các feature mới.
- Component (19): kho lưu trữ riêng tư (R2 bucket thứ hai).
