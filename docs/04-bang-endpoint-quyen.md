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
| `POST /auth/login` | Công khai | 20 lượt/phút/IP; sai 5 lần/phút theo IP+email thì khoá tạm (Redis); ghi `audit_logs` |
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
