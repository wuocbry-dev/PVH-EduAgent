# PVH-EduAgent

Website Trường THPT Phan Văn Hớn tích hợp AI Agent (xem `docs/01-phan-tich-de-tai.md`).

Monorepo pnpm gồm 3 phần:

| Thư mục | Công nghệ | Vai trò |
|---|---|---|
| `apps/web` | Next.js 16 (App Router, Tailwind 4) | Website public + CMS quản trị |
| `apps/api` | NestJS 12 | REST API, RBAC, AI Agent (Claude Agent SDK), Telegram, Scheduler |
| `packages/shared` | TypeScript | Kiểu và hằng số dùng chung: vai trò, quyền, trạng thái bài viết |

## Cấu trúc thư mục (feature-based)

Mỗi tính năng nằm gọn trong một thư mục `features/<tên>`, gồm đủ controller/service/DTO (backend) hoặc api/components (frontend). Code dùng chung giữa nhiều feature đặt ở `common/` (backend) hoặc `shared/` (frontend).

```
apps/api/src/
├── main.ts                      # prefix /api, CORS cho WEB_ORIGIN
├── app.module.ts
├── config/env.validation.ts     # kiểm tra .env bằng zod
├── infrastructure/database/     # PrismaService (kết nối PostgreSQL)
├── generated/prisma/            # Prisma Client sinh tự động (không commit)
├── common/                      # decorator, pipe, kiểm tra quyền, kiểu dùng chung
└── features/
    ├── auth/                    # F10: đăng nhập JWT (cookie httpOnly), refresh, đổi/quên mật khẩu, guard toàn cục
    ├── users/
    ├── posts/                   # bài viết + posts.agent-tools.ts
    ├── tasks/                   # công việc & hạn chót + tasks.agent-tools.ts
    ├── system/                  # health/status + system.agent-tools.ts
    ├── audit-log/               # ghi log mọi thao tác, kể cả của agent
    ├── agent/                   # AI Agent: Claude Agent SDK
    │   ├── agent-tool.ts        #   hợp đồng AgentToolProvider
    │   ├── agent.service.ts     #   gọi query(), ghép tool của các feature
    │   ├── agent.controller.ts  #   POST /api/agent/chat
    │   └── prompts/system-prompt.ts
    ├── telegram/                # (khung) webhook, liên kết OTP, nút xác nhận
    └── scheduler/               # (khung) BullMQ: đăng bài hẹn giờ, nhắc hạn

apps/web/src/
├── proxy.ts                     # chặn /admin khi chưa đăng nhập, tự refresh token
├── app/                         # chỉ định tuyến, trang mỏng
│   ├── (public)/                #   /, /tin-tuc
│   ├── (auth)/                  #   /dang-nhap, /quen-mat-khau, /dat-lai-mat-khau
│   └── admin/                   #   /admin, /admin/tro-ly-ai, /admin/doi-mat-khau
├── features/
│   ├── auth/    {api, components, proxy.ts, index.ts}
│   ├── posts/   {api, components, index.ts}
│   ├── tasks/   {api, components, index.ts}
│   └── agent/   {api, components, index.ts}
└── shared/      {config, lib/api-client.ts, lib/server-api.ts}
```

Quy ước: trang trong `app/` chỉ import từ `@/features/<tên>` (file `index.ts`), không import sâu vào bên trong feature.

## Chạy dự án

```bash
pnpm install
```

```bash
cp apps/api/.env.example apps/api/.env
```

```bash
cp apps/web/.env.example apps/web/.env.local
```

Trong `apps/api/.env`: điền `JWT_ACCESS_SECRET` (chuỗi ngẫu nhiên ≥ 32 ký tự, vd. `openssl rand -hex 32`) và `ANTHROPIC_API_KEY` (tạo key tại https://console.anthropic.com/settings/keys), rồi:

```bash
pnpm dev
```

- Web: http://localhost:3000 · Quản trị: http://localhost:3000/admin (đăng nhập bằng tài khoản mẫu, mật khẩu `Pvh@2026`) · Trợ lý AI: http://localhost:3000/admin/tro-ly-ai
- API: http://localhost:4000/api (vd. `/api/system/health`)

### Cơ sở dữ liệu (PostgreSQL + Prisma)

Lần đầu: tạo tài khoản/CSDL bằng `apps/api/prisma/init-db.sql`, rồi:

```bash
pnpm db:migrate
```

```bash
pnpm db:seed
```

Xem dữ liệu: `pnpm db:studio`. Hướng dẫn đầy đủ (pgAdmin, psql, migration, sao lưu, lỗi thường gặp): [docs/02-huong-dan-postgresql.md](docs/02-huong-dan-postgresql.md).

## Đăng nhập (F10)

| Endpoint | Việc |
|---|---|
| `POST /api/auth/login` | Email + mật khẩu → đặt cookie `pvh_access` (JWT 15 phút) và `pvh_refresh` (7 ngày) |
| `POST /api/auth/refresh` | Cấp cặp token mới, thu hồi refresh token cũ |
| `POST /api/auth/logout` | Thu hồi refresh token, xoá cookie |
| `GET /api/auth/me` | Người đang đăng nhập (tên, vai trò, quyền) |
| `POST /api/auth/change-password` | Đổi mật khẩu, đăng xuất mọi phiên khác |
| `POST /api/auth/forgot-password`, `/reset-password` | Link đặt lại mật khẩu hạn 30 phút (tạm in ra log API, chưa gửi email) |

- Cookie `httpOnly`, `SameSite=Lax`, `Secure` khi production; refresh token chỉ lưu bản băm (bảng `refresh_tokens`).
- Sai mật khẩu 5 lần/phút (theo IP + email) thì bị chặn tạm thời (429). Đăng nhập thành công/thất bại đều ghi `audit_logs`.
- Web: `src/proxy.ts` chuyển `/admin/*` về `/dang-nhap` khi chưa đăng nhập và tự refresh khi access token hết hạn. Web và API phải cùng tên miền gốc để dùng chung cookie (dev: cùng `localhost`).
- Chế độ thử nghiệm: `DEV_AUTH=true` (API, chỉ khi `NODE_ENV=development`) + `NEXT_PUBLIC_DEV_AUTH=true` (web) → trang Trợ lý AI có ô chọn vai trò (header `x-dev-user-email`).

## AI Agent và API key

- Key nằm ở `ANTHROPIC_API_KEY` trong `apps/api/.env`, chỉ backend đọc, không bao giờ gửi xuống trình duyệt. Thiếu key thì API vẫn chạy, riêng `/api/agent/chat` trả 503.
- Key mua từ nhà cung cấp bên thứ 3: điền thêm `ANTHROPIC_BASE_URL` bằng endpoint họ cung cấp.
- Model mặc định `claude-opus-5-5`, đổi qua `AGENT_MODEL`. Giới hạn mỗi yêu cầu: `AGENT_MAX_TURNS`, `AGENT_MAX_BUDGET_USD`.
- Agent chỉ có các tool nghiệp vụ do hệ thống định nghĩa: tool có sẵn của Claude Code (Bash, Read, Edit…) bị tắt, MCP/connector trên máy chủ bị bỏ qua. Mỗi tool kiểm tra quyền phía server theo vai trò của người đang ra lệnh và được ghi audit log.

### Thêm tool cho agent

1. Trong feature, tạo `<feature>.agent-tools.ts` implement `AgentToolProvider` (xem `posts.agent-tools.ts`), gọi service của feature, và để service tự kiểm tra quyền.
2. Thêm provider vào `providers`/`exports` của module feature.
3. Thêm class vào `toolProviders` trong `features/agent/agent.module.ts`.

### Xác nhận 2 bước cho thao tác nhạy cảm (A08)

- Tool `approve_post` (đăng ngay), `schedule_post` (duyệt kèm giờ hẹn), `reschedule_post` (dời lịch), `unpublish_post` (gỡ bài) **không thực thi ngay**: chỉ kiểm tra quyền và trạng thái bài, tạo bản ghi `agent_actions` (`PENDING`, hết hạn sau 10 phút) rồi báo "đang chờ xác nhận" (`features/agent-actions`).
- Telegram: bot gửi tin kèm nút **Xác nhận / Huỷ**. Web: thẻ xác nhận ngay trong trang Trợ lý AI (mở lại trang vẫn thấy các yêu cầu còn chờ).
- Khi bấm, hệ thống kiểm tra đúng người ra lệnh, chưa hết hạn, chưa xử lý, kiểm tra lại quyền rồi thực thi qua `PostsService`. Bấm lặp hoặc đồng thời chỉ chạy một lần. Trạng thái: `PENDING → CONFIRMED → DONE/FAILED`, hoặc `CANCELLED`/`EXPIRED`; job mỗi phút chuyển yêu cầu quá hạn sang `EXPIRED`. Mọi bước ghi `audit_logs` (`agent_action.*`).
- Thêm tool nhạy cảm mới: đặt vào `features/agent-actions` (gọi `AgentActionsService.propose`, thêm nhánh thực thi trong `execute`), không gọi thẳng service ghi.
- Tool không nhạy cảm: `summarize_day` (việc và bài hẹn trong ngày), `create_announcement` (bài nháp ở chuyên mục Thông báo).

## Bot Telegram (A01–A04)

### Tạo bot bằng BotFather

1. Trong Telegram, mở [@BotFather](https://t.me/BotFather), gửi `/newbot`.
2. Đặt tên hiển thị (vd. `Trợ lý THPT Phan Văn Hớn`) và username kết thúc bằng `bot` (vd. `pvh_eduagent_bot`).
3. BotFather trả về token dạng `123456789:AA...`. Đây là bí mật: chỉ dán vào `apps/api/.env`, không commit, không gửi cho ai.
4. Tuỳ chọn: `/setdescription`, `/setuserpic`; `/setcommands` rồi dán:
   ```
   start - Bắt đầu / hướng dẫn liên kết
   status - Tình trạng hệ thống
   deadline - Công việc sắp đến hạn và quá hạn
   unlink - Huỷ liên kết tài khoản
   help - Hướng dẫn
   ```
5. Lộ token: `/revoke` trong BotFather để lấy token mới.

### Cấu hình `apps/api/.env`

```env
TELEGRAM_BOT_TOKEN=123456789:AA...      # bỏ trống = tắt bot
TELEGRAM_MODE=polling                   # polling (dev) | webhook (production) | off
TELEGRAM_WEBHOOK_SECRET=                # bắt buộc với webhook: openssl rand -hex 32
TELEGRAM_WEBHOOK_URL=                   # vd. https://pvh.edu.vn/api/telegram/webhook
```

- **Dev (`polling`)**: không cần URL public, chạy `pnpm dev` là bot nhận tin. Mỗi token chỉ một tiến trình polling được (tiến trình thứ hai báo lỗi 409), nên đừng chạy hai API cùng token.
- **Production (`webhook`)**: Telegram gọi `POST /api/telegram/webhook` (HTTPS) kèm header `X-Telegram-Bot-Api-Secret-Token`; sai secret → 401. Có `TELEGRAM_WEBHOOK_URL` thì API tự gọi `setWebhook` lúc khởi động.
- Liên kết tài khoản cần Redis (`REDIS_URL`): OTP lưu trong Redis dạng băm, hạn 5 phút, dùng một lần.

### Sử dụng

1. Đăng nhập trang quản trị → **Tài khoản** (`/admin/tai-khoan`) → **Liên kết Telegram** → nhận mã 6 số.
2. Gửi cho bot `/link <mã>` (hoặc bấm **Mở bot trên Telegram**). Sai/hết hạn bị từ chối; sai 5 lần thì khoá 10 phút.
3. Lệnh: `/status` (A03), `/deadline` (A04), `/unlink`, `/help`. Nhắn tự do thì trợ lý AI trả lời và thao tác **đúng quyền** của tài khoản đã liên kết.
4. Thông báo của bộ lập lịch (nhắc hạn, báo cáo ngày, kết quả đăng bài) được gửi qua bot cho người đã liên kết.

Chat chưa liên kết chỉ nhận hướng dẫn liên kết; tin trong nhóm bị bỏ qua; mỗi chat tối đa 20 tin/phút. Liên kết, huỷ liên kết, lệnh và chat đều ghi `audit_logs` (kênh `telegram`).

## Lệnh khác

| Lệnh | Việc |
|---|---|
| `pnpm build` | Build shared → api → web |
| `pnpm lint` | oxlint (api) + eslint (web) |
| `pnpm test` | e2e test cho API (cần PostgreSQL đã migrate + seed) |

## Lộ trình phát triển với Claude Code

Các bước tiếp theo (F01–F17, A01–A09) được đóng gói thành lệnh `/buoc` cho Claude Code (dùng được trong VS Code):

| Lệnh | Việc |
|---|---|
| `/buoc tiep` | Làm bước kế tiếp chưa xong |
| `/buoc 3` | Làm đúng bước 3 |
| `/buoc tiendo` | Xem tiến độ |

Yêu cầu từng bước: `.claude/skills/buoc/steps/`. Tiến độ: [docs/TIEN-DO.md](docs/TIEN-DO.md).
