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
    ├── auth/                    # guard toàn cục (tạm: DevAuthGuard, sau: JWT)
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
├── app/                         # chỉ định tuyến, trang mỏng
│   ├── (public)/                #   /, /tin-tuc
│   └── admin/                   #   /admin, /admin/tro-ly-ai
├── features/
│   ├── posts/   {api, components, index.ts}
│   ├── tasks/   {api, components, index.ts}
│   └── agent/   {api, components, index.ts}
└── shared/      {config, lib/api-client.ts}
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

Điền `ANTHROPIC_API_KEY` trong `apps/api/.env` (tạo key tại https://console.anthropic.com/settings/keys), rồi:

```bash
pnpm dev
```

- Web: http://localhost:3000 · Trợ lý AI: http://localhost:3000/admin/tro-ly-ai
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

## AI Agent và API key

- Key nằm ở `ANTHROPIC_API_KEY` trong `apps/api/.env`, chỉ backend đọc, không bao giờ gửi xuống trình duyệt. Thiếu key thì API vẫn chạy, riêng `/api/agent/chat` trả 503.
- Key mua từ nhà cung cấp bên thứ 3: điền thêm `ANTHROPIC_BASE_URL` bằng endpoint họ cung cấp.
- Model mặc định `claude-opus-5-5`, đổi qua `AGENT_MODEL`. Giới hạn mỗi yêu cầu: `AGENT_MAX_TURNS`, `AGENT_MAX_BUDGET_USD`.
- Agent chỉ có các tool nghiệp vụ do hệ thống định nghĩa: tool có sẵn của Claude Code (Bash, Read, Edit…) bị tắt, MCP/connector trên máy chủ bị bỏ qua. Mỗi tool kiểm tra quyền phía server theo vai trò của người đang ra lệnh và được ghi audit log.

### Thêm tool cho agent

1. Trong feature, tạo `<feature>.agent-tools.ts` implement `AgentToolProvider` (xem `posts.agent-tools.ts`), gọi service của feature, và để service tự kiểm tra quyền.
2. Thêm provider vào `providers`/`exports` của module feature.
3. Thêm class vào `toolProviders` trong `features/agent/agent.module.ts`.

Thao tác ảnh hưởng công khai (duyệt, hẹn giờ, gỡ bài) cần xác nhận 2 bước qua Telegram (A08) trước khi đưa thành tool.

## Lệnh khác

| Lệnh | Việc |
|---|---|
| `pnpm build` | Build shared → api → web |
| `pnpm lint` | oxlint (api) + eslint (web) |
| `pnpm test` | e2e test cho API |
