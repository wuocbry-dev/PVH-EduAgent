# Bảng endpoint → quyền (bước 10)

Nguồn duy nhất là hằng `ROUTES` trong `apps/api/test/security.e2e-spec.ts`. Test đó:

1. so khớp danh sách route thật của ứng dụng (đọc từ metadata controller) với bảng này, và `@Public()` phải khớp cột "Công khai";
2. gọi từng route không công khai khi chưa đăng nhập → luôn `401`;
3. gọi từng route cần quyền bằng tài khoản không có quyền nào (vai trò STUDENT) → luôn `4xx`.

Thêm endpoint mới mà chưa cập nhật bảng thì test đỏ.

**Cách kiểm tra:** `JwtAuthGuard` là guard toàn cục (mọi route cần đăng nhập trừ khi có `@Public()`); quyền được kiểm tra **trong service** bằng `assertPermission` / `can`, quyền sở hữu (IDOR) kiểm tra ở service tương ứng.

Ký hiệu: **Công khai** = không cần đăng nhập; **Tự phục vụ** = cần đăng nhập, chỉ thao tác dữ liệu của chính mình; còn lại là quyền cần có (nhiều quyền = cần đủ hoặc theo ghi chú).

## Xác thực – `/auth`

| Endpoint | Truy cập | Ghi chú |
|---|---|---|
| `POST /auth/login` | Công khai | nhận email hoặc mã học sinh/giáo viên (`identifier`); 20 lượt/phút/IP; sai 5 lần/phút theo IP + tài khoản thì khoá tạm (Redis); ghi `audit_logs` |
| `POST /auth/activate` | Công khai | kích hoạt tài khoản bằng mã dùng một lần rồi đăng nhập luôn; 20 lượt/phút/IP; **sai** 5 lần/15 phút theo mã đăng nhập hoặc 20 lần/10 phút theo IP thì khoá tạm (429); mọi lý do thất bại cùng một thông báo (không lộ mã học sinh có tồn tại) |
| `POST /auth/refresh` | Công khai | cần cookie `pvh_refresh` hợp lệ (xoay vòng, dùng một lần) |
| `POST /auth/logout` | Công khai | thu hồi refresh token nếu có |
| `GET /auth/me` | Tự phục vụ | |
| `POST /auth/change-password` | Tự phục vụ | cần mật khẩu hiện tại; thu hồi phiên khác |
| `POST /auth/forgot-password` | Công khai | 5 lượt/phút/IP; luôn trả 202 (không lộ tài khoản có tồn tại) |
| `POST /auth/reset-password` | Công khai | cần token đặt lại hợp lệ, một lần |

## Trợ lý AI – `/agent`

| Endpoint | Truy cập | Ghi chú |
|---|---|---|
| `POST /agent/chat` | Tự phục vụ | 10 lượt/phút/tài khoản; mỗi tool tự kiểm quyền theo người ra lệnh |
| `GET /agent/actions` | Tự phục vụ | chỉ hành động của chính mình |
| `POST /agent/actions/:id/confirm` | Tự phục vụ | chỉ người tạo (người khác 404 + audit); kiểm tra lại quyền khi thực thi |
| `POST /agent/actions/:id/cancel` | Tự phục vụ | như trên |

## Quản trị hệ thống

| Endpoint | Quyền |
|---|---|
| `GET /audit-logs`, `GET /audit-logs/filters` | `system:read` |
| `GET /settings` | `system:read` |
| `PATCH /settings` | `setting:manage` |
| `GET /system/status` | `system:read` |
| `GET /system/dashboard` | Tự phục vụ (từng nhóm số liệu theo quyền: `post:approve`, `task:read:*`, `system:read`) |
| `GET /system/health` | Công khai (chỉ trả `ok`/`down`) |
| `GET /roles`, `PUT /roles/:code/permissions` | `user:manage` |
| `GET /users`, `POST /users`, `PATCH /users/:id`, `PATCH /users/:id/status`, `POST /users/:id/reset-password` | `user:manage` |

`GET /users` có thêm bộ lọc `classId`, tìm theo mã học sinh/giáo viên; trả `code`, `className`, trạng thái `PENDING` (chờ kích hoạt).

## Cổng theo vai trò (bước 15)

Web chọn cổng giao diện (`/admin`, `/bgh`, `/bien-tap`, `/giao-vien`, `/hoc-sinh`) theo vai trò; ẩn menu và chuyển hướng **không phải** bảo mật, API vẫn kiểm tra quyền như các bảng dưới đây. Access token có thêm claim `roles` chỉ để proxy của web định tuyến; đổi vai trò người dùng thu hồi mọi phiên của họ.

| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `GET /academic/me` | Tự phục vụ | mã, lớp, năm học, giáo viên chủ nhiệm (học sinh) hoặc các lớp chủ nhiệm (giáo viên) của chính mình |
| `GET /system/overview` | `academic:manage` | số lớp, học sinh, giáo viên của năm học hiện hành (trang tổng quan BGH) |

## Thời khoá biểu – `/timetable` (bước 17)

| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `GET /timetable/frame`, `GET /timetable/fixed` | Tự phục vụ | khung tiết và tiết cố định ai đăng nhập cũng xem |
| `PUT /timetable/frame` | `timetable:manage` hoặc `setting:manage` | khung sai/thu hẹp khi còn tiết ngoài khung → 400/409 |
| `GET /timetable/versions`, `/versions/:id/slots`, `/options`, `/stats`, `/unavailability`, `/export` | `timetable:read` | BGH, ADMIN |
| `POST/DELETE /timetable/versions`, `POST /versions/:id/publish`, `POST /versions/:id/slots`, `PATCH/DELETE /slots/:id`, `POST/DELETE /fixed` | `timetable:manage` | chỉ BGH; chỉ sửa bản nháp; trùng giáo viên/lớp/phòng/tiết cố định → 409; giáo viên báo bận cần `confirmUnavailable` (ghi audit); công bố khi còn thiếu tiết bị từ chối |
| `GET/PUT /timetable/unavailability/mine` | Tự phục vụ | PUT chỉ giáo viên (có hồ sơ giáo viên) |
| `GET /timetable/view/mine` | Tự phục vụ | giáo viên: tiết mình dạy; học sinh: lớp mình |
| `GET /timetable/view/class/:classId` | Tự phục vụ | `timetable:read`, hoặc học sinh lớp đó, hoặc giáo viên dạy/chủ nhiệm lớp đó |
| `GET /timetable/view/teacher/:teacherId` | Tự phục vụ | `timetable:read`, hoặc chính giáo viên đó |
| `PATCH /academic/classes/sessions` | `academic:manage` | chỉnh buổi học của lớp hàng loạt theo khối |

## Đợt thi và điểm – `/scores` (bước 18)

Điểm là dữ liệu nhạy cảm nhất: **ADMIN không có quyền điểm nào**, AI Agent và Telegram không có đường nào tới điểm (có test). Ngoài quyền, service còn kiểm tra **phạm vi phân công** (giáo viên–lớp–môn–học kỳ, phân công cả năm áp cho mọi học kỳ); người ngoài phạm vi luôn nhận 403, kể cả khi đoán id (không phân biệt "không tồn tại"). Ghi điểm (lưu, nhập Excel, công bố, miễn) giới hạn 60 lần/phút/tài khoản (`RateLimitService`, khoá `score-write`) → 429. `audit_logs` chỉ ghi mã đợt, lớp và số lượng; giá trị điểm chỉ nằm ở `scores` và `score_history`.

| Endpoint | Truy cập | Ghi chú |
|---|---|---|
| `GET /scores/context` | `score:enter`, `assessment:manage` hoặc `score:read:all` | học kỳ của năm hiện hành, lớp–môn **của chính giáo viên** (môn tính điểm) |
| `GET /scores/assessments` | `score:enter` hoặc `score:read:all` | giáo viên: chỉ đợt và lớp thuộc phân công của mình; BGH: mọi đợt |
| `POST /scores/assessments` | `score:enter` (thường xuyên) / `assessment:manage` (giữa kỳ, cuối kỳ) | thường xuyên: một lớp trong phạm vi phân công, mã `KT-<năm>-HK<n>-<môn>-<lớp>-<số>`; giữa kỳ/cuối kỳ: một khối, mặc định mọi lớp của khối, mã `GK/CK-<năm>-HK<n>-<môn>-K<khối>` hoặc mã BGH đặt (trùng → 409); môn đánh giá bằng nhận xét → 400; ngày ngoài học kỳ → 400 |
| `PATCH /scores/assessments/:id`, `DELETE /scores/assessments/:id` | người tạo đợt thường xuyên (`score:enter`, còn trong phạm vi) hoặc `assessment:manage` | hạn nhập điểm (`entryDeadline`) chỉ BGH đặt; đợt đã có lịch sử điểm hoặc đã công bố không xoá được (409) |
| `GET /scores/assessments/:id/classes/:classId` | trong phạm vi phân công, hoặc `score:read:all` | bảng điểm một lớp: học sinh, điểm, trạng thái, số còn trống |
| `PUT /scores/assessments/:id/classes/:classId` | chỉ giáo viên được phân công | lưu hàng loạt; `8,5` = `8.5`, 0–10, tối đa 2 chữ số thập phân; vắng có lý do (`ABSENT`) bắt buộc ghi chú, điểm trống; học sinh phải thuộc lớp, không trùng; học sinh được miễn → 409; quá hạn nhập → 409; mỗi ô thay đổi một dòng `score_history` |
| `POST /scores/assessments/:id/classes/:classId/publish` | giáo viên được phân công hoặc `assessment:manage` | công bố theo lớp; vẫn sửa được trong hạn nhập |
| `PUT /scores/assessments/:id/classes/:classId/exemptions/:studentId` | `assessment:manage` | đặt/bỏ miễn kiểm tra (bắt buộc lý do), ghi `score_history` |
| `GET /scores/assessments/:id/classes/:classId/template` | giáo viên được phân công | file mẫu điền sẵn mã + tên học sinh của lớp (chống Excel injection) |
| `POST /scores/assessments/:id/classes/:classId/import/preview` | giáo viên được phân công, trong hạn | kiểm tra phạm vi **trước** khi đọc file; tối đa 2 MB, 200 dòng; 20 lượt/phút; bản xem trước ở Redis 30 phút |
| `POST /scores/import/:previewId/confirm` | `score:enter` (chính người tải lên) | dùng một lần; kiểm tra lại phạm vi, hạn nhập, danh sách lớp; 10 lượt/phút |
| `GET /scores/progress` | `score:read:all` | tiến độ theo đợt–lớp: đã nhập/sĩ số, đã công bố, giáo viên dạy |

## Phân công giảng dạy – `/teaching` (bước 16)

| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `GET /teaching/quotas`, `/teaching/assignments`, `/teaching/summary`, `/teaching/summary/export` | `teaching:read` | BGH và ADMIN; thống kê/cảnh báo, xuất Excel chống Excel injection |
| `PUT /teaching/quotas`, `PUT /teaching/quotas/class` | `teaching:assign` | chỉ BGH; số tiết 0–10, `null` = xoá định mức |
| `POST /teaching/assignments`, `PATCH/DELETE /teaching/assignments/:id` | `teaching:assign` | chỉ BGH; một lớp–môn một giáo viên chính (409), khác tổ chuyên môn cần `confirmCrossDepartment`, giáo viên khoá/không có hồ sơ → 400 |
| `POST /teaching/assignments/copy` | `teaching:assign` | sao chép từ năm học/học kỳ khác theo tên lớp, không tạo trùng, liệt kê dòng bị bỏ qua |
| `PUT /teaching/teachers/:userId/quota` | `teaching:assign` | định mức tiết riêng của giáo viên (`null` = mặc định) |
| `GET /teaching/mine` | Tự phục vụ | chỉ phân công của chính mình (năm học hiện hành) |

## Học vụ – `/academic`, `/roster` (bước 14)

| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `GET/POST/PATCH/DELETE /academic/school-years…`, `/academic/semesters…` | `academic:manage` | luôn đúng một năm hiện hành (index duy nhất một phần); không xoá năm hiện hành hay năm còn lớp |
| `GET /academic/grades`, `GET/POST/PATCH/DELETE /academic/departments…`, `/subjects…`, `/rooms…` | `academic:manage` | tổ còn môn/giáo viên và môn/phòng đang có dữ liệu thì 409 |
| `GET /academic/teachers`, `GET/POST/PATCH/DELETE /academic/classes…` | `academic:manage` | tên lớp duy nhất trong năm học; chủ nhiệm phải là giáo viên có hồ sơ; lớp còn học sinh thì 409 |
| `GET /academic/classes/:id/students` | `academic:manage`, hoặc giáo viên chủ nhiệm đúng lớp đó | kiểm tra trong service (`isHomeroomOf`) |
| `POST /academic/students/:userId/transfer` | `academic:manage` | một học sinh chỉ thuộc một lớp mỗi năm học |
| `GET /roster/templates/:kind` | `student:import` | file `.xlsx` mẫu (dữ liệu giả) |
| `POST /roster/import/:kind/preview` | `student:import` | thân request là chính file `.xlsx` (≤ 2 MB, ≤ 3000 dòng, không đánh giá công thức, chặn zip phình to); chưa ghi CSDL, lưu tạm Redis 30 phút; 20 lượt/phút |
| `POST /roster/import/:previewId/confirm` | `student:import` | kiểm tra lại với CSDL hiện tại rồi tạo trong một transaction; mỗi bản xem trước dùng một lần, chỉ người tải lên xác nhận được; trả phiếu kèm mã kích hoạt gốc (chỉ lần này) |
| `POST /roster/users/:userId/activation-code` | `student:import`, hoặc giáo viên chủ nhiệm lớp của học sinh đó | cấp mã mới, thu hồi mã cũ và mọi phiên đăng nhập; tài khoản khoá thì 409; người không đủ quyền luôn nhận 403 (không phân biệt id có tồn tại) |
| `POST /roster/classes/:classId/activation-codes` | `student:import` | phát hành phiếu cả lớp, chỉ cho học sinh còn chờ kích hoạt |

## Nội dung

| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `GET /posts/manage`, `GET /posts/manage/:id` | `post:create` | tác giả chỉ thấy bài của mình; `post:approve` thấy tất cả |
| `POST /posts` | `post:create` | |
| `PATCH /posts/:id`, `POST /posts/:id/submit`, `DELETE /posts/:id` | `post:create` | chỉ tác giả (xoá bài đã gỡ chỉ ADMIN) |
| `POST /posts/:id/approve` | `post:approve` + `post:schedule` | |
| `POST /posts/:id/reject` | `post:approve` | |
| `POST /posts/:id/reschedule`, `/publish`, `/cancel-schedule` | `post:schedule` | |
| `POST /posts/:id/unpublish`, `/restore` | `post:unpublish` | |
| `GET /categories`, `GET /events` | Công khai | |
| `POST/PATCH/DELETE /categories…`, `POST/PATCH/DELETE /events…` | `post:approve` | |
| `POST /media/presign` | `post:create` | xin URL ký sẵn để PUT file lên kho; ảnh JPEG/PNG/WebP/GIF ≤ 10 MB, video MP4/WebM ≤ 100 MB; 30 lượt/phút; tối đa 20 yêu cầu chờ/người |
| `POST /media/:id/complete` | `post:create` | chỉ người tạo (hoặc `post:approve`); kiểm tra object có thật, đúng kích thước và đúng loại theo magic bytes, sai thì xoá object |
| `GET /media` | `post:create` | chỉ file đã hoàn tất; danh sách chỉ file của mình (trừ `post:approve`); lọc `?kind=IMAGE\|VIDEO` |
| `DELETE /media/:id` | `post:create` | chỉ người tạo (hoặc `post:approve`); 409 nếu đang dùng trong bài đã đăng/hẹn giờ |
| `PUT /media/local-upload/:id` | Công khai (token) | chỉ driver `local` (404 với `r2`); token HMAC trong query ràng buộc id + MIME + kích thước, hết hạn 10 phút |
| `GET /media/files/:name` | Công khai | chỉ driver `local` (404 với `r2`); tên file phải khớp `<uuid>.<đuôi>` và là file đã hoàn tất; `nosniff` |
| `GET /public/posts`, `/public/posts/:slug`, `/public/admission`, `/public/settings`, `/public/gallery` | Công khai | chỉ bài `PUBLISHED`, không lộ thông tin cá nhân |
| `POST /public/posts/:slug/view` | Công khai | mỗi IP một lượt/bài/30 phút |
| `POST /contacts` | Công khai | ô ẩn chống bot; 3 liên hệ/10 phút/IP |
| `GET /contacts`, `PATCH /contacts/:id/status` | `post:approve` | |

## Công việc

| Endpoint | Quyền | Ghi chú |
|---|---|---|
| `GET /tasks`, `GET /tasks/deadlines`, `GET /tasks/:id` | `task:read:all` hoặc `task:read:own` | `own` bị ép về việc của mình |
| `GET /tasks/assignees` | `task:assign` hoặc `task:read:all` | không gồm học sinh |
| `POST /tasks`, `PATCH /tasks/:id`, `DELETE /tasks/:id` | `task:assign` | |
| `PATCH /tasks/:id/status` | người được giao, hoặc `task:assign` | |

## Telegram – `/telegram`

| Endpoint | Truy cập | Ghi chú |
|---|---|---|
| `POST /telegram/webhook` | Công khai | chỉ khi `TELEGRAM_MODE=webhook`; bắt buộc header `X-Telegram-Bot-Api-Secret-Token` (so sánh an toàn thời gian); không áp hạn mức chung |
| `GET /telegram/link`, `POST /telegram/link-code`, `DELETE /telegram/link` | Tự phục vụ | chỉ liên kết của chính mình; 10 mã/phút |

## Lớp bảo vệ chung (`bootstrap/configure-app.ts`, `common/filters`, `infrastructure/rate-limit`)

- `helmet` (CSP chặn mọi nguồn, `frame-ancestors 'none'`, `nosniff`, `Referrer-Policy: no-referrer`, CORP `same-site`); ảnh công khai tự đặt `cross-origin`.
- CORS chỉ cho `WEB_ORIGIN` kèm cookie. **Chống CSRF:** cookie `HttpOnly` + `SameSite=Lax` (`Secure` khi production); request ghi (`POST/PUT/PATCH/DELETE`) mang header `Origin` khác `WEB_ORIGIN` bị `403`.
- Giới hạn body JSON/form (`BODY_LIMIT`, mặc định 1 MB; ảnh tải lên 5 MB riêng) → `413`.
- Giới hạn tần suất toàn API (`@nestjs/throttler`, đếm trong Redis, dự phòng bộ nhớ): mặc định `THROTTLE_LIMIT`/phút theo tài khoản (hoặc IP), route nhạy cảm có hạn mức riêng.
- Lỗi thống nhất `{ statusCode, message }` tiếng Việt; lỗi không lường trước luôn trả "Lỗi hệ thống, vui lòng thử lại sau" (chi tiết và stack chỉ ở log máy chủ). Production ghi log JSON.
- Production từ chối khởi động nếu `DEV_AUTH=true`, `THROTTLE_DISABLED=true`, `WEB_ORIGIN` không phải `https://`, thiếu `REDIS_URL`, hoặc webhook Telegram thiếu secret.
