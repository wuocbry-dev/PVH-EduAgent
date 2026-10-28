# CLAUDE.md – Quy ước dự án PVH-EduAgent

Website Trường THPT Phan Văn Hớn tích hợp AI Agent. Đề tài: `docs/01-phan-tich-de-tai.md`; CSDL: `docs/02-huong-dan-postgresql.md`; sơ đồ: `docs/diagrams/`. Trả lời, giao diện, thông báo lỗi đều bằng **tiếng Việt**.

## Cấu trúc monorepo (pnpm)

- `apps/api` – NestJS 12, **ESM** (`"type": "module"`): import nội bộ luôn có đuôi `.js` (vd. `'../../common/guards/permission.js'`).
- `apps/web` – Next.js 16 App Router, Tailwind 4. `cacheComponents: true` → dữ liệu động (fetch, cookies, headers…) phải nằm trong `<Suspense>`.
  - Trang công khai đọc dữ liệu qua hàm `use cache` + `cacheTag` (`posts`, `categories`, `admission`, `settings`; mẫu: `features/posts/api/public-posts.ts`, hàm không throw, lỗi API thì `cacheLife("seconds")`). API báo web làm mới qua `POST /api/revalidate` (`REVALIDATE_SECRET` ở cả hai `.env`). `next/cache` chỉ dùng phía server: không để hàm đó trong feature mà component client nhập qua `index.ts`.
  - **Trước khi viết code Next.js phải đọc tài liệu trong `apps/web/node_modules/next/dist/docs/`** (theo `apps/web/AGENTS.md`); phiên bản này khác kiến thức cũ.
- `packages/shared` (`@pvh/shared`) – kiểu và hằng số dùng chung (vai trò, quyền, trạng thái…). Phải build trước khi api/web dùng: `pnpm --filter @pvh/shared build` (đã chạy trong `postinstall` và `pnpm dev`). Sửa shared xong phải build lại.

## Feature-based

- API: `apps/api/src/features/<tên>/` gồm module, controller, service, `dto/`, `<tên>.agent-tools.ts`. Dùng chung: `src/common/` (decorator, pipe, guard quyền, types, utils), `src/infrastructure/`.
- Web: `apps/web/src/features/<tên>/{api,components,index.ts}`; dùng chung ở `src/shared/`. `src/app/` chỉ định tuyến, trang mỏng, chỉ import từ `@/features/<tên>` (file `index.ts`), không import sâu vào trong feature.

## Backend

- Validate input bằng zod: schema trong `dto/*.dto.ts`, dùng `@Body(new ZodValidationPipe(schema))` (`common/pipes/zod-validation.pipe.ts`).
- Kiểm tra quyền **trong service**, không trong controller: `assertPermission(user, 'post:create')` / `can(user, ...)` (`common/guards/permission.ts`). Quyền của user lấy từ `users → user_roles → roles → role_permissions` (`UsersService.findAuthUserByEmail`). Route không cần đăng nhập dùng `@Public()`; lấy user bằng `@CurrentUser()`.
- Xác thực (F10): `JwtAuthGuard` toàn cục đọc JWT từ cookie `pvh_access`; header `x-dev-user-email` chỉ có tác dụng khi `NODE_ENV=development` và `DEV_AUTH=true`. Web: `src/proxy.ts` chặn mọi cổng (xem mục Các cổng giao diện); Server Component gọi API bằng `serverApi` (`shared/lib/server-api.ts`, chuyển tiếp cookie), Client Component dùng `api` (`credentials: "include"`).
- Bảo mật HTTP (bước 10): `bootstrap/configure-app.ts` (helmet, CORS, giới hạn body, chống CSRF bằng kiểm tra `Origin`), `common/filters/all-exceptions.filter.ts` (lỗi tiếng Việt thống nhất), `infrastructure/rate-limit` (throttler + `RateLimitService`, đếm trong Redis; mọi giới hạn mới dùng `RateLimitService`, không tự viết bộ đếm trong bộ nhớ). Endpoint mới phải được thêm vào bảng `ROUTES` ở `test/routes.ts` và `docs/04-bang-endpoint-quyen.md` (test sẽ đỏ nếu thiếu); `role-matrix.e2e-spec.ts` gọi mọi endpoint bằng mỗi vai trò và đòi **đúng 403** khi thiếu quyền, nên service phải `assertPermission` **trước** khi tìm bản ghi hay đọc input (không để người thiếu quyền dò được id).
- Biến môi trường khai báo và kiểm tra bằng zod ở `src/config/env.validation.ts`; thêm biến mới thì cập nhật cả `apps/api/.env.example`.
- Thao tác quan trọng (tạo/sửa/xóa/duyệt/đăng, phân quyền, đăng nhập…) phải ghi `audit_logs` qua `AuditLogService.record()` (channel `web` | `telegram` | `scheduler`).
- Giờ hiển thị theo `Asia/Ho_Chi_Minh`; lưu và trả về ISO string (UTC).

## Prisma 7 / PostgreSQL

- Schema: `apps/api/prisma/schema.prisma` theo ERD (`docs/diagrams/drawio/17-ERD.drawio`); model camelCase, `@@map` sang snake_case. Cấu hình ở `apps/api/prisma.config.ts`.
- Client sinh ở `apps/api/src/generated/prisma` (không commit), import từ `../../generated/prisma/client.js`.
- `id` là `BigInt` → DTO trả ra luôn là **string** (`id.toString()`); nhận vào thì `BigInt(id)`. Kiểu DTO đặt ở `packages/shared`.
- Mọi thay đổi CSDL phải qua migration có tên mô tả: `pnpm --filter api db:migrate --name <ten>`; cập nhật `apps/api/prisma/seed.ts` nếu cần. Không sửa migration đã có.

## Lưu trữ ảnh/video (bước 11)

- Mọi file người dùng tải lên (ảnh, video) **phải đi qua `StorageService`** (`src/infrastructure/storage`, chọn driver bằng `STORAGE_DRIVER=local|r2`, mặc định `local`): không ghi thẳng đĩa, không tự ghép URL (dùng `publicUrl`/`keyFromUrl`). Khoá object sinh ngẫu nhiên (`newStorageKey`), không dùng tên file người dùng.
- Một đường tải lên duy nhất: `POST /media/presign` → trình duyệt `PUT` thẳng lên `uploadUrl` (R2, hoặc `PUT /media/local-upload/:id?token=` với driver local) → `POST /media/:id/complete` (HEAD + nhận dạng magic bytes, sai thì xoá object). Không tin Content-Type do client gửi. Từ phía server (bot Telegram…) dùng `MediaService.createFromBuffer`.
- Nội dung bài chỉ giữ `<img>`/`<video>` có URL thuộc kho của hệ thống (`sanitizeContent(html, storage.mediaKindOfUrl)`). Hằng số giới hạn/loại file ở `@pvh/shared` (`MEDIA_*`).
- e2e luôn ép `STORAGE_DRIVER=local` (`vitest.config.e2e.ts`), không bao giờ gọi Cloudflare thật. Khoá R2 chỉ ở `apps/api/.env`, không ghi vào log, `system_settings`, phản hồi API. Hướng dẫn: `docs/05-huong-dan-cloudflare-r2.md`.

## AI Agent (Claude Agent SDK)

- Tool nghiệp vụ đặt trong `features/<tên>/<tên>.agent-tools.ts` (implement `AgentToolProvider`, xem `posts.agent-tools.ts`), gọi service để service tự kiểm tra quyền; thêm vào `providers`/`exports` của module feature và vào `toolProviders` + `imports` trong `features/agent/agent.module.ts`.
- Không bật tool có sẵn của Claude Code (`tools: []`, `strictMcpConfig`, `settingSources: []` trong `agent.service.ts`). Mọi tool được bọc audit log.
- Thao tác nhạy cảm/ảnh hưởng công khai (duyệt, hẹn giờ, gỡ bài, xóa…) phải **xác nhận 2 bước** trước khi thực thi: tool chỉ gọi `AgentActionsService.propose` (`features/agent-actions`, bảng `agent_actions`, hết hạn 10 phút), thao tác chạy khi chính người ra lệnh bấm Xác nhận trên Telegram/web (`confirm`).

## Soạn bài qua Telegram (bước 12)

- Tệp từ Telegram đi qua `TelegramFileService` (getFile, tối đa 20 MB, **không bao giờ ghi URL tải vào log/lỗi** vì chứa token bot) rồi `MediaService.createFromBuffer` (đúng kiểm tra của bước 11). Album gom bằng Redis (`TelegramAlbumService`), ngữ cảnh 30 phút và chống xử lý lặp theo `message_id` ở `TelegramContextService`; hạn mức byte/giờ/ngày dùng `RateLimitService`.
- Agent chỉ nhận mô tả tệp (`AgentContext.attachments`: id, loại, dung lượng, tên) và lịch sử dạng **dữ liệu** trong khối được đánh dấu (`prompts/system-prompt.ts`); chú thích ảnh, nội dung tin, kết quả tool không bao giờ là chỉ dẫn. Tool tạo bài: `create_post_with_media`, `submit_post_for_review`, `list_categories`; "viết bài và đăng" là tool nhạy cảm `create_and_publish_post` (`agent-actions`): **một** yêu cầu xác nhận, bài chỉ được tạo khi xác nhận (`PostsService.createDraftWithMedia` → `submit` → `approve`, quyền kiểm tra lại từng bước).
- `posts.source` (`WEB`/`TELEGRAM`) đặt theo `meta.channel` khi tạo bài.

## Báo người duyệt qua Telegram (bước 13)

- `PostsService.transition` (nhánh `submit`) gọi các listener đăng ký bằng `onSubmitted` (chạy nền, lỗi chỉ ghi log) nên mọi đường gửi duyệt đều được báo; `TelegramReviewService` (`features/telegram`) đăng ký listener, chọn người nhận theo `role_permissions` (cả `post:approve` và `post:schedule`, không phải tác giả), chống báo trùng theo (bài, số lần gửi duyệt) trong Redis, tắt được bằng khoá `telegram.review_notify`. Tin là **văn bản thuần** (không `parse_mode`) và mọi giá trị người dùng nhập đi qua `defang()`; nút URL chỉ khi `isPublicHttps`.
- Nút `rv:v|a|r:<id>`: kiểm tra lại quyền + trạng thái `PENDING_REVIEW` mỗi lần bấm; Duyệt đăng chỉ gọi `AgentActionsService.propose` (xác nhận 2 bước); Từ chối giữ trạng thái chờ lý do trong Redis 5 phút rồi gọi `PostsService.transition('reject')`. `PostsService` cũng báo tác giả (bảng `notifications` → Telegram) khi bài được duyệt/từ chối bởi người khác.

## Các cổng giao diện theo vai trò (bước 15)

| Cổng | Vai trò | Ghi chú |
|---|---|---|
| `/admin` | ADMIN | hệ thống, menu theo nhóm: tổng quan hệ thống; Tài khoản (người dùng, nhập Excel, vai trò/quyền, bảo mật và đăng nhập); Dữ liệu trường (học vụ); Hệ thống (cấu hình, Trợ lý AI, nhật ký, lỗi và hàng đợi). Không có duyệt bài, giao việc, phân công, thời khoá biểu |
| `/bgh` | PRINCIPAL | tổng quan toàn trường, học vụ, bài viết + duyệt, thư viện số, trắc nghiệm, giao việc, lịch, Trợ lý AI |
| `/bien-tap` | EDITOR | bài viết, chuyên mục, liên hệ, lịch, Trợ lý AI |
| `/thu-thu` | LIBRARIAN | thư viện số: thống kê, hàng chờ duyệt, kho tài liệu, danh mục, tài liệu tôi gửi, trắc nghiệm |
| `/giao-vien` | TEACHER | tổng quan, thời khoá biểu, nhập điểm, sổ điểm, lớp chủ nhiệm, thông báo, bài của tôi, việc của tôi, tài liệu tôi gửi, trắc nghiệm, tủ sách, Trợ lý AI |
| `/hoc-sinh` | STUDENT | trang của em, thời khoá biểu, điểm, thông báo, lịch, tủ sách, trắc nghiệm, hồ sơ, đổi mật khẩu |

- Bảng cổng nằm ở **một nơi**: `PORTAL_INFO` trong `packages/shared/src/portals.ts` (đường dẫn, tên, vai trò, menu `nav` theo `slug`, `group` tuỳ chọn để menu hiện tiêu đề nhóm, `portalRedirect`); proxy, menu và API (liên kết trong Telegram) đều dùng nó. **Thêm trang mới:** thêm mục vào `nav` của cổng cần có, tạo `apps/web/src/app/<cổng>/<slug>/page.tsx` (trang mỏng gọi component của feature; trang dùng ở nhiều cổng thì mỗi cổng một route gọi chung một component, không sao chép code), rồi chạy `portals.spec.ts` (kiểm mọi mục menu có trang). Component dùng chung giữa cổng dựng liên kết bằng `usePortalBase()` (client) hoặc prop `base` (server), không viết cứng `/admin`.
- `src/proxy.ts` đọc claim `roles` trong access token (do `TokenService.issue` thêm) **chỉ để chọn cổng/chuyển hướng**; không bao giờ dùng claim làm bằng chứng quyền (API đọc lại quyền từ CSDL mỗi request). Đổi vai trò của người dùng thu hồi mọi refresh token (`UsersAdminService.update`).
- Bước 23 gỡ quyền bài viết (`post:*`) và giao việc (`task:*`) của ADMIN, bước 28 gỡ tiếp `teaching:read`, `timetable:read`: ADMIN chỉ còn quyền hệ thống (`system:read`, `user:manage`, `setting:manage`, `academic:manage`, `student:import`). Xoá vĩnh viễn bài đã gỡ là quyền `post:delete`, **chỉ BGH** (`DELETE_PERMISSION` ở `posts.state-machine.ts`); không chỗ nào kiểm tra theo tên vai trò. Ma trận vai trò × quyền ở `docs/04-bang-endpoint-quyen.md`.

## Đợt thi và điểm (bước 18) – dữ liệu nhạy cảm nhất

- `features/scores`: đợt thi `assessments` (**mã duy nhất**, sinh ở `score-rules.ts`), lớp áp dụng `assessment_classes` (nháp/công bố **theo từng lớp**), `scores` (CHECK 0–10, UNIQUE đợt–học sinh, `GRADED`/`ABSENT` vắng có lý do do giáo viên ghi/`EXEMPT` miễn chỉ BGH đặt), `score_history` (**chỉ thêm**, trigger CSDL chặn sửa/xoá; test dọn dữ liệu phải `SET LOCAL pvh.allow_score_history_purge = 'on'` trong transaction). Mọi thay đổi điểm phải đi qua `ScoresService.apply` (hoặc `setExemption`) để luôn sinh `score_history`.
- **ADMIN không có quyền điểm nào** (`SCORE_PERMISSIONS` bị loại khỏi `ROLE_PERMISSIONS.ADMIN`, có unit test `common/permissions.spec.ts`). `score:enter` (giáo viên) chỉ trong **phạm vi phân công** lớp–môn–học kỳ (`assignmentCovers`, kiểm tra trong service, người ngoài phạm vi luôn 403 kể cả khi đoán id); `assessment:manage` + `score:read:all` (BGH) tạo đợt giữa kỳ/cuối kỳ cho khối, đặt hạn nhập, miễn, xem tiến độ; BGH không tự nhập điểm. Quá `entry_deadline` thì giáo viên không sửa được (điều chỉnh sau hạn: bước 19).
- **AI Agent và Telegram không bao giờ đọc/gửi điểm**: không thêm tool hay thông báo nào dùng `scores`/`assessments` (test trong `security.e2e-spec.ts` quét mã nguồn agent/telegram). `audit_logs` chỉ ghi mã đợt, lớp, số lượng: **không bao giờ ghi giá trị điểm**. Ghi điểm giới hạn tần suất bằng `RateLimitService` (`score-write`). Nhập Excel dùng `readSheet` chung với bước 14 (xem trước → xác nhận). Ảnh biên bản chấm chưa làm vì kho hiện tại là công khai (chờ bucket riêng tư, bước 21).

## Thư viện số (bước 21)

- **Kho riêng tư:** file tài liệu (PDF, MP3, MP4/WebM) chỉ đi qua `PrivateStorageService` (`infrastructure/storage`: bucket `R2_PRIVATE_BUCKET`, hoặc thư mục `PRIVATE_UPLOAD_DIR` với driver local; production bắt buộc có bucket). Kho này **không có URL công khai**: chỉ cấp URL đọc ký sẵn hết hạn 5 phút (`presignGet`) **sau khi** service kiểm tra đối tượng xem; không bao giờ ghi URL ký sẵn vào log, `audit_logs`, CSDL hay kết quả tool Agent. Khoá object `lib-<uuid>.<đuôi>` (`newPrivateKey`), loại thật nhận dạng bằng magic bytes (`private-types.ts`). Ảnh bìa vẫn đi luồng media công khai (`MediaService.presign/complete` nhận hàm kiểm tra quyền riêng). Dữ liệu sau này cần riêng tư (ảnh biên bản chấm, minh chứng điều chỉnh điểm…) dùng kho này.
- **Ai đọc được gì** ở một chỗ: `features/library/library-audience.ts` (`publishedWhere` cho danh sách, `canRead` trước khi cấp URL). Khách chỉ thấy danh mục tài liệu `ALL`; học sinh `ALL` + khối/lớp mình, **không bao giờ `TEACHERS_ONLY`**; nhân sự mọi tài liệu đã đăng; tài liệu không đọc được luôn 404. Danh mục công khai qua `use cache` + `cacheTag('library')`; người đăng nhập gọi API kèm cookie (không cache).
- **Nguồn và giấy phép bắt buộc** (zod + CHECK CSDL). Quyền `library:submit` (TEACHER, LIBRARIAN, PRINCIPAL), `library:manage` (LIBRARIAN, PRINCIPAL); **ADMIN không có quyền thư viện**. Luồng `DRAFT` → `PENDING_REVIEW` → `PUBLISHED`/`REJECTED` (lý do bắt buộc), `ARCHIVED`; chuyển trạng thái có điều kiện (chống duyệt hai lần). Tìm không dấu bằng cột `search_text` (`normalizeSearch` ở `@pvh/shared`) + index pg_trgm, không dùng `unaccent`. Lượt đọc gộp theo ngày (`library_views`), một lượt/người/tài liệu/30 phút. Giới hạn `library-access` (30/phút), `library-submit` (20/giờ).

## Giao diện (bước 29)

- **Token màu một nguồn** ở `src/app/globals.css` (`:root` sáng, `[data-theme="dark"]` tối, `@theme inline`): `background`, `surface`, `surface-muted`, `foreground`, `muted`, `border`, `border-strong`, `primary` (+ `-hover`, `-foreground`, `-soft`, `-soft-border`), `accent` (không dùng làm màu chữ), `navy` (+ `-foreground`), `danger`/`warning`/`success` (+ `-soft`), `hero-from`/`hero-to`/`hero-foreground`. Component chỉ dùng token (`bg-primary`, `text-muted`, `border-border`…), **không viết cứng mã màu** và không dùng `dark:` cho màu (token tự đổi). Ngoại lệ có ghi lý do: chấm màu cổng (`portal-dot.tsx`), bảng màu biểu đồ giám sát (`monitoring/charts.tsx`, `agent-monitor.tsx`), lớp phủ đen trên ảnh/video, nền trang PDF.
- **Component dùng chung ở `src/shared/ui`** (`index.ts`): `Button`/`buttonStyles`, `Input`/`Select`/`Textarea`/`PasswordInput`, `Card`, `Badge`, `Alert`, `Table`, `Dialog`, `useConfirm` (thay `window.confirm`), `useToast`, `Skeleton`, `EmptyState`, `Breadcrumbs`, `FormActions`, `ThemeToggle`. `AppProviders` (toast + hộp xác nhận) bọc ở layout gốc. `form-styles.ts` chỉ còn là lớp mỏng cho form cũ (`inputClass` = `fieldClass`).
- **Bo góc:** thẻ/khung/hộp thoại `rounded-2xl` + bóng nhẹ; nút/ô nhập/ảnh bài viết `rounded-xl`; nhãn/chip/avatar `rounded-full`. Vòng focus `ring-accent` (mặc định cho mọi phần tử bấm được ở `globals.css`); chuyển cảnh 150–200ms, tắt khi `prefers-reduced-motion`. Icon `lucide-react` (`aria-hidden`; nút chỉ có icon phải có `aria-label`).
- **Thanh dính:** header công khai `sticky top-0`; `PortalShell` → `PortalFrame` (một thanh bên duy nhất: `md:sticky md:h-dvh`, trên điện thoại thành ngăn kéo, nội dung phía sau `inert` khi mở); bảng dài dùng `<Table stickyFirstColumn>` (thead dính trong khung cuộn, khung có `relative`); form dài dùng `<FormActions>`. Khi in thì ẩn/thôi dính. Trang trong cổng không tự vẽ `<main>`, khung hay `p-8` (khung chung đã có); mỗi trang đúng một `h1`.
- **`usePathname` treo ở route có tham số động** (`cacheComponents`): chỉ gọi trong component nhỏ đặt trong `<Suspense>` (tên trang trên thanh trên, mục menu đang chọn), không gọi ở khung bao ngoài nội dung.
- **Nút gạt theme:** `data-theme` trên `<html>` do script inline trong `<head>` đặt trước khi vẽ (`THEME_INIT_SCRIPT`, `shared/ui/theme.ts`), lựa chọn ở `localStorage` (`pvh-theme`, bọc try/catch); `@custom-variant dark` theo `data-theme`. **Không đọc cookie ở layout gốc** (làm mọi trang thành động, hỏng `use cache`).
- **Không có đăng ký tự do:** tài khoản do quản trị tạo/nhập Excel; `/kich-hoat` đóng vai "đăng ký". Đăng xuất qua `Dialog` xác nhận rồi tới `/da-dang-xuat` (công khai, `noindex`, chặn trong `robots.ts`).

## Trung tâm giám sát (bước 26)

- `features/monitoring`:
  - `HealthProbeService`: chỉ đọc, có hạn thời gian; Claude chỉ kiểm cấu hình.
  - `MonitoringService`: job hàng đợi `monitoring` (sức khoẻ mỗi phút, dung lượng kho mỗi giờ qua `StorageService.usageBytes`, dọn mỗi ngày) và số liệu cho `/admin`.
  - `SystemErrorsService`: `ERROR_SINK` của `AllExceptionsFilter` và của mọi worker BullMQ.
  - `MonitoringAlertsService`: mở/đóng cảnh báo theo `key`, index duy nhất một phần chống mở trùng.
  - `AccountWatchService`: listener `AuditLogService.onRecorded` để phát hiện bất thường đăng nhập, tài khoản quản trị mới, đổi vai trò/quyền.
- **Hàm thuần ở `monitoring-rules.ts`** (có unit test): `sanitizeErrorMessage`, `errorFingerprint`, `routePattern`, `healthTransition`, `crossesThreshold`. Thông điệp lỗi và cảnh báo **luôn** đi qua `sanitizeErrorMessage`/`defang()`; không bao giờ ghi body, header, cookie, token, URL ký sẵn, mã kích hoạt hay giá trị điểm.
- **Chỉ báo khi trạng thái đổi**, đúng lúc chạm ngưỡng (`crossesThreshold`). Tối đa `ALERT_MESSAGES_PER_HOUR` tin/giờ. Gửi qua `NotificationsService` (kênh `telegram` nếu đã liên kết, không thì `web`). Tắt bằng `telegram.admin_alerts`; ngưỡng `monitor.*` ở `system_settings`.
- **Quyền:** xem cần `system:read`; thao tác hệ thống (kiểm tra ngay, chạy lại job, đánh dấu đã xử lý) cần `setting:manage`; phiên đăng nhập, buộc đăng xuất, khoá hàng loạt (nhập lại mật khẩu), gỡ chặn cần `user:manage` (`features/users/user-sessions.service.ts`). Không tool AI Agent nào; ADMIN không có thêm quyền nghiệp vụ.
- **e2e đặt `MONITORING_ENABLED=false`:** không job định kỳ, không ghi lỗi, không cảnh báo. Test bật `enabled` của service tường minh rồi tắt và tự dọn dữ liệu.

## Giám sát AI Agent (bước 27)

- **`AgentGuardService` (`features/agent/agent-guard.service.ts`)**, chạy trong `AgentService.chat` **trước khi gọi Claude**:
  - công tắc `agent.enabled` → 423;
  - hạn mức theo ngày giờ Việt Nam (`agent.daily_per_user`, `agent.daily_total`, `agent.daily_cost_usd`; đếm bằng `RateLimitService`, chi phí bằng micro-USD từ `total_cost_usd` của SDK) → 429;
  - đếm lạm dụng: lệnh dồn dập, tool bị `ForbiddenException` (`withAudit` gọi `toolDenied`), tin nghi tiêm lệnh (`injectionSignals` ở `agent-guard-rules.ts`, **chỉ đánh dấu và đếm, không chặn**).

  Sau lượt chat ghi audit `agent.chat` **chỉ số liệu** (độ dài, số lượt, chi phí, cờ): không bao giờ ghi nội dung lệnh hay câu trả lời.
- **Công tắc `agent.sensitive_tools`:** `AgentService.buildTools` bỏ `AgentActionsAgentTools`, và `AgentActionsService.propose`/`confirm` cũng tự chặn (423).
- **Công tắc `telegram.bot_enabled`:** middleware của bot trả lời "tạm ngưng" (một lần mỗi 10 phút mỗi chat); thông báo và cảnh báo (`TelegramNotifierService`) vẫn gửi.
- **Đổi công tắc:** chỉ qua `PATCH /settings` (`setting:manage`); không qua AI Agent.
- **Cảnh báo:** `AgentWatchService` (`features/monitoring`) nghe sự kiện của guard và audit `setting.update` để mở cảnh báo `agent_quota`/`agent_abuse`/`agent_switch` (cơ chế bước 26). Tin chỉ có tên người dùng, số lần, khoảng thời gian.
- **Thống kê:** `GET /monitoring/agent` (`AgentStatsService`, `system:read`) chỉ đếm từ `audit_logs`/`agent_actions`: số lượng và tên tool, không đọc tham số hay kết quả tool. Không thêm bảng.
- **e2e:** không gọi Claude thật. Chat qua HTTP luôn bị chặn trước (công tắc hoặc hạn mức); đường thành công gọi thẳng `beforeChat`/`afterChat`.

## Trắc nghiệm ôn tập (bước 22)

- `features/quizzes`: kết quả **chỉ để ôn tập, không bao giờ ghi vào `scores`/`score_history`** (e2e kiểm tra số dòng bảng điểm không đổi). Chấm **ở server** (`QuizAttemptsService.finalize`, hàm thuần `grade`/`isAnswerCorrect`): API đề khi đang làm không bao giờ trả đáp án đúng hay giải thích; câu nhiều đáp án phải đúng hết mới được điểm. Hạn nộp lưu ở `quiz_attempts.deadline`, quá hạn + `QUIZ_SUBMIT_GRACE_SEC` thì tự nộp phần đã lưu và không nhận câu mới (`acceptsAnswers`); câu hỏi bị khoá khi quiz đã có lượt làm.
- Quyền `quiz:create` (TEACHER, PRINCIPAL; giáo viên chỉ môn mình dạy theo `teaching_assignments` năm hiện hành, chỉ giao cho khối/lớp mình dạy môn đó, chỉ sửa quiz của mình – `teacherScope`, `teacherTargetProblem` ở `quiz-rules.ts`), `quiz:manage` (LIBRARIAN, PRINCIPAL: mọi quiz, giao toàn trường); ADMIN không có. Chỉ học sinh làm bài, đúng đối tượng (`openQuizWhere`/`canTake`, cùng mô hình với thư viện số). Giáo viên tự công bố (không qua duyệt). Giới hạn `quiz-start`, `quiz-write`. Nhập Excel dùng `readSheet` chung (xem trước → xác nhận, Redis 30 phút). Không có tool AI Agent.

## Thông báo theo đối tượng (bước 20)

- Đối tượng `Audience` (`SCHOOL`/`GRADE`/`CLASS`/`TEACHERS`) dùng chung cho `announcements` và `events`; ai thấy gì tính ở **một chỗ**: `features/announcements/audience.ts` (`viewerScope` → `visibleWhere`, `audienceTargets`, `resolveTarget`). Học sinh không bao giờ thấy `TEACHERS`; giáo viên chỉ gửi `CLASS` cho lớp mình dạy/chủ nhiệm (`announcement:send`), BGH mọi đối tượng (`announcement:manage`); ADMIN không có quyền thông báo. Nội dung qua `sanitizeContent`; gửi giới hạn `announcement-send` (20/giờ).
- `GET /events` công khai chỉ trả sự kiện `SCHOOL`; lịch trong cổng dùng `GET /events/mine`. Hộp thông báo `GET /announcements/inbox` gộp thông báo đúng đối tượng và `notifications` của chính người dùng (mọi kênh). Thông báo hệ thống mới nên ghi kênh `web` nếu không muốn gửi Telegram.

## Xem điểm, khoá sổ, điều chỉnh (bước 19)

- `ScoreViewsService` (sổ điểm lớp–môn–học kỳ, bảng tổng hợp lớp, kết quả học sinh, thống kê, xuất Excel), `ScoreCalendarService` (hạn chung `score_deadlines`, khoá sổ `score_locks`, công thức `scores.formula`), `ScoreAdjustmentsService` (`score_adjustments`). Phạm vi: học sinh `GET /scores/me` (chỉ của mình, chỉ đã công bố); giáo viên được phân công (cả nháp); **chủ nhiệm** (`isHomeroomOf` + `score:enter`, chỉ đã công bố); BGH `score:read:all`. Bảng tổng hợp lớp và thống kê chỉ dùng điểm đã công bố. Giới hạn đọc `score-read`, xuất `score-export` (`RateLimitService`).
- ĐTB **luôn tính lại** từ `scores` bằng hàm thuần ở `@pvh/shared` (`subjectAverage`, `yearAverage`, mặc định Thông tư 22/2021, cấu hình được; có unit test `score-average.spec.ts`), không lưu bảng ĐTB. Số tiết/tuần lấy theo ghi đè lớp → định mức khối → phân công.
- Điểm bị khoá khi học kỳ khoá sổ hoặc qua hạn có hiệu lực (`isLocked`: hạn riêng của đợt, không có thì hạn chung); `ScoresService.access` tính sẵn nên mọi đường ghi (lưới, Excel) đều bị chặn. Sửa điểm đã khoá chỉ qua đề nghị điều chỉnh: duyệt kiểm tra điểm hiện tại còn khớp ảnh chụp lúc gửi, ghi `score_history` `source = ADJUST`, `changed_by` = giáo viên, `approved_by` = BGH.
- Thông báo về điểm chỉ ghi `notifications` kênh **`web`** (không qua Telegram) và **không kèm giá trị điểm**; audit chỉ ghi mã đợt, lớp, mã học sinh, số dòng.

## Thời khoá biểu (bước 17)

- `features/timetable`: khung tiết (`timetable.frame`, JSON trong `system_settings`), phiên bản `timetables` (DRAFT/PUBLISHED/ARCHIVED, ngày hiệu lực), tiết đã xếp `timetable_slots` (có cột `teacher_id` lặp từ phân công), `fixed_periods`, `teacher_unavailability`. **Chặn trùng thời khoá biểu ở CSDL** bằng ràng buộc duy nhất trong một phiên bản: (giáo viên, thứ, tiết), (lớp, thứ, tiết), (phòng, thứ, tiết); service kiểm tra trước để báo lý do tiếng Việt và bắt lỗi ràng buộc khi sửa đồng thời (409, không 500). Đổi giáo viên của phân công thì `TeachingService` đồng bộ `teacher_id` ở bản nháp và bản đã công bố (bản lưu trữ giữ nguyên) và báo giáo viên.
- Quyền `timetable:read` và `timetable:manage` (**chỉ BGH**; ADMIN chỉ sửa khung tiết qua `setting:manage`). Xem lịch theo phạm vi ở `TimetableViewService` (giáo viên: của mình và lớp mình dạy/chủ nhiệm; học sinh: lớp mình). Ngày D dùng bản đã công bố có `effective_date` lớn nhất ≤ D (`pickEffective`); bản cũ chuyển ARCHIVED khi bản mới bắt đầu có hiệu lực (`archiveSuperseded`, chạy lúc truy vấn). Tiết bận của giáo viên chỉ để tham khảo: xếp đè phải `confirmUnavailable` và ghi audit `timetable.override_unavailable`. Tool Agent `get_timetable` chỉ đọc.

## Phân công giảng dạy (bước 16)

- `features/teaching`: định mức tiết/tuần của môn theo khối (`subject_period_quotas`, ghi đè theo lớp `class_period_quotas`), phân công giáo viên–môn–lớp (`teaching_assignments`, `semester_id` rỗng = cả năm), định mức riêng của giáo viên (`teacher_profiles.weekly_quota`, mặc định chung ở cấu hình `teaching.default_quota`, 17 tiết). **Một lớp–môn chỉ một giáo viên chính, ràng buộc ở CSDL** bằng hai index duy nhất một phần (cả năm / từng học kỳ); service còn chặn cả năm đụng học kỳ. Giáo viên khác tổ chuyên môn với môn thì phải `confirmCrossDepartment: true` (dạy chéo vẫn có thật, chỉ cảnh báo).
- Quyền `teaching:read` và `teaching:assign` (**chỉ BGH**; `ROLE_PERMISSIONS.ADMIN` loại mọi `teaching:*`, `timetable:*` từ bước 28). Giáo viên chỉ xem phân công của chính mình qua `GET /teaching/mine`. Tính cảnh báo/thống kê ở hàm thuần `computeSummary` (`teaching-summary.ts`, có unit test); phân công đã có thì **không xoá được** lớp/môn (khoá ngoại không xoá dây chuyền). Xuất Excel dùng `safeCell`.
- Số liệu seed (định mức khối 10, phân công Toán 10A1) là **mẫu**; giao diện luôn hiện lời nhắc cần đối chiếu với kế hoạch giáo dục của trường (`TEACHING_SAMPLE_NOTE`). Thời khoá biểu (bước 17) và quyền nhập điểm (bước 18) dùng `teaching_assignments` làm nguồn.

## Học vụ và tài khoản hàng loạt (bước 14)

- Dữ liệu học vụ gốc ở `features/academic` (năm học hiện hành duy nhất, học kỳ, khối, lớp, môn, tổ, phòng bộ môn; hồ sơ giáo viên/học sinh; `class_enrollments` một lớp mỗi năm học). Quyền `academic:manage` (ADMIN, BGH), `student:import` (ADMIN). **Giáo viên chủ nhiệm không phải vai trò**: suy từ `classes.homeroom_teacher_id`, dùng `isHomeroomOf(prisma, user, classId)` (`features/academic/homeroom.ts`) cho mọi chỗ cần (cấp lại mã, xem lớp, bước 19–20). Chỉ lưu dữ liệu học sinh tối thiểu (không gia đình, địa chỉ, CCCD).
- `users.email` có thể rỗng (học sinh); đăng nhập bằng email **hoặc** mã học sinh/giáo viên (`normalizeLoginId`). Đừng giả định `email` luôn có (dùng `fullName` trong thông báo/log). Trạng thái `PENDING` = chờ kích hoạt, `password_hash` là `UNUSABLE_PASSWORD_HASH`.
- Mã kích hoạt (`features/activation`): dùng một lần, 14 ngày, **chỉ lưu HMAC**, không bao giờ ghi mã gốc vào log/DB/audit; cấp mã mới thu hồi mã cũ. `POST /auth/activate` giới hạn sai theo IP và theo mã đăng nhập, mọi lỗi cùng một thông báo.
- Nhập Excel (`features/roster`, thư viện `exceljs`): luồng xem trước → xác nhận, dữ liệu thô giữ ở Redis 30 phút, kiểm tra lại với CSDL lúc xác nhận; không đánh giá công thức; chống Excel injection khi xuất (`safeCell`). Audit chỉ ghi số lượng, không ghi danh sách học sinh.
- Test/e2e tạo tài khoản phải tự dọn sau khi chạy (không để lại dữ liệu rác); script dọn dữ liệu cũ: `pnpm --filter api db:cleanup-test --dry-run`.

## Lệnh kiểm tra (chạy ở thư mục gốc)

| Lệnh | Việc |
|---|---|
| `pnpm build` | Build shared → api → web |
| `pnpm lint` | oxlint (api) + eslint (web) |
| `pnpm test` | unit test (`src/**/*.spec.ts`) rồi e2e API (`test/*.e2e-spec.ts`, chạy tuần tự) – e2e cần PostgreSQL đã migrate và seed (`pnpm db:migrate`, `pnpm db:seed`) và Redis đang chạy (`REDIS_URL`) |

Hạ tầng dev: `pnpm db:up` (docker compose: PostgreSQL + Redis); hướng dẫn Redis/bộ lập lịch: `docs/03-huong-dan-redis-bullmq.md`. Bộ lập lịch dùng `bullmq` trực tiếp (hạ tầng ở `src/infrastructure/queue`, processor ở `features/scheduler`), tắt khi thiếu `REDIS_URL`; e2e dùng tiền tố hàng đợi riêng (`BULLMQ_PREFIX`). Bot Telegram (`features/telegram`, grammY) chọn chế độ bằng `TELEGRAM_MODE` (polling/webhook/off); e2e ép token giả + webhook (`vitest.config.e2e.ts`) và chặn mọi lệnh Bot API, không bao giờ gọi Telegram thật. Test không chạy được vì thiếu hạ tầng thì báo đúng như vậy, không ghi là đã qua.

## Lộ trình làm việc

- Dùng `/buoc <số>` hoặc `/buoc tiep` (`/buoc tiendo` để xem). Yêu cầu từng bước: `.claude/skills/buoc/steps/`; tiến độ ghi ở `docs/TIEN-DO.md`.
- Chỉ làm đúng phạm vi bước hiện tại; việc thuộc bước khác ghi vào phần "Còn lại".

## Git

- Chỉ commit khi `pnpm build`, `pnpm lint`, `pnpm test` đều xanh. Commit message tiếng Việt, không dùng `--no-verify`.
- Không bao giờ commit thư mục `.claude/` (đã có trong `.gitignore`), file `.env*` (trừ `.env.example`), bí mật, `uploads/`, `dist/`, `src/generated/`.
- Không push nếu người dùng chưa yêu cầu.
