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
- Xác thực (F10): `JwtAuthGuard` toàn cục đọc JWT từ cookie `pvh_access`; header `x-dev-user-email` chỉ có tác dụng khi `NODE_ENV=development` và `DEV_AUTH=true`. Web: `src/proxy.ts` chặn `/admin`; Server Component gọi API bằng `serverApi` (`shared/lib/server-api.ts`, chuyển tiếp cookie), Client Component dùng `api` (`credentials: "include"`).
- Biến môi trường khai báo và kiểm tra bằng zod ở `src/config/env.validation.ts`; thêm biến mới thì cập nhật cả `apps/api/.env.example`.
- Thao tác quan trọng (tạo/sửa/xóa/duyệt/đăng, phân quyền, đăng nhập…) phải ghi `audit_logs` qua `AuditLogService.record()` (channel `web` | `telegram` | `scheduler`).
- Giờ hiển thị theo `Asia/Ho_Chi_Minh`; lưu và trả về ISO string (UTC).

## Prisma 7 / PostgreSQL

- Schema: `apps/api/prisma/schema.prisma` theo ERD (`docs/diagrams/drawio/17-ERD.drawio`); model camelCase, `@@map` sang snake_case. Cấu hình ở `apps/api/prisma.config.ts`.
- Client sinh ở `apps/api/src/generated/prisma` (không commit), import từ `../../generated/prisma/client.js`.
- `id` là `BigInt` → DTO trả ra luôn là **string** (`id.toString()`); nhận vào thì `BigInt(id)`. Kiểu DTO đặt ở `packages/shared`.
- Mọi thay đổi CSDL phải qua migration có tên mô tả: `pnpm --filter api db:migrate --name <ten>`; cập nhật `apps/api/prisma/seed.ts` nếu cần. Không sửa migration đã có.

## AI Agent (Claude Agent SDK)

- Tool nghiệp vụ đặt trong `features/<tên>/<tên>.agent-tools.ts` (implement `AgentToolProvider`, xem `posts.agent-tools.ts`), gọi service để service tự kiểm tra quyền; thêm vào `providers`/`exports` của module feature và vào `toolProviders` + `imports` trong `features/agent/agent.module.ts`.
- Không bật tool có sẵn của Claude Code (`tools: []`, `strictMcpConfig`, `settingSources: []` trong `agent.service.ts`). Mọi tool được bọc audit log.
- Thao tác nhạy cảm/ảnh hưởng công khai (duyệt, hẹn giờ, gỡ bài, xóa…) phải **xác nhận 2 bước** trước khi thực thi.

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
