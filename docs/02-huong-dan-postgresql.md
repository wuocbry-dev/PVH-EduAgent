# Hướng dẫn sử dụng PostgreSQL cho PVH-EduAgent

> Tài liệu 02 – Cơ sở dữ liệu. Lược đồ: `apps/api/prisma/schema.prisma` (theo ERD hình 17).

## 1. Tổng quan

| Thành phần | Trên máy bạn |
|---|---|
| PostgreSQL | Bản 18, chạy như dịch vụ Windows `postgresql-x64-18`, cổng `5432` |
| Công cụ dòng lệnh | `C:\Program Files\PostgreSQL\18\bin\psql.exe` (kèm `pg_dump`, `pg_restore`) |
| Giao diện đồ hoạ | pgAdmin 4 (cài cùng PostgreSQL), hoặc Prisma Studio (`pnpm --filter api db:studio`) |
| ORM | Prisma 7: schema → migration SQL → Prisma Client có kiểu TypeScript |
| CSDL của dự án | `pvh_eduagent`, chủ sở hữu là tài khoản `pvh` |

Luồng làm việc:

```
schema.prisma ──(db:migrate)──► prisma/migrations/*.sql ──► bảng trong PostgreSQL
      │
      └──(db:generate)──► src/generated/prisma (Prisma Client cho NestJS)
```

> Mẹo: thêm `C:\Program Files\PostgreSQL\18\bin` vào biến môi trường `Path` để gõ `psql` ở bất kỳ đâu. Các lệnh bên dưới ghi đường dẫn đầy đủ cho chắc.

## 2. Cài đặt lần đầu

### Bước 1 – Tạo tài khoản và CSDL (chạy một lần)

Mở PowerShell tại thư mục gốc dự án, chạy bằng tài khoản quản trị `postgres` (nhập mật khẩu bạn đặt khi cài PostgreSQL):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f apps/api/prisma/init-db.sql
```

File `init-db.sql` tạo tài khoản `pvh` (mật khẩu `pvh`, có quyền `CREATEDB` để Prisma tạo shadow database khi migrate) và CSDL `pvh_eduagent`.

Kiểm tra đăng nhập bằng tài khoản mới (mật khẩu `pvh`):

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U pvh -d pvh_eduagent -c "select current_user;"
```

### Bước 2 – Chuỗi kết nối

Trong `apps/api/.env`:

```env
DATABASE_URL=postgresql://pvh:pvh@localhost:5432/pvh_eduagent
```

Dạng chung: `postgresql://USER:MẬT_KHẨU@HOST:CỔNG/TÊN_CSDL`. Mật khẩu có ký tự đặc biệt (`@ : / # ?`) phải mã hoá URL, ví dụ `@` → `%40`.

### Bước 3 – Tạo bảng và dữ liệu mẫu

```powershell
pnpm --filter api db:migrate
pnpm --filter api db:seed
```

- `db:migrate` áp dụng các migration trong `apps/api/prisma/migrations` (17 bảng theo ERD + bảng bổ sung ở mục 3) và sinh lại Prisma Client.
- `db:seed` nạp vai trò, quyền, tài khoản mẫu, chuyên mục, bài viết, công việc, số liệu tuyển sinh. Chạy lại nhiều lần vẫn an toàn.

Tài khoản mẫu (mật khẩu chung `Pvh@2026`, đổi qua biến `SEED_PASSWORD`):

| Email | Vai trò |
|---|---|
| admin@pvh.edu.vn | ADMIN – Quản trị hệ thống |
| bgh@pvh.edu.vn | PRINCIPAL – Ban giám hiệu |
| bientap@pvh.edu.vn | EDITOR – Biên tập viên |
| gv.toan@pvh.edu.vn | TEACHER – Giáo viên |

Đăng nhập tại http://localhost:3000/dang-nhap. Khi chạy dev với `DEV_AUTH=true` (apps/api/.env), API vẫn cho chọn tài khoản qua header `x-dev-user-email` để thử nghiệm.

## 3. Các bảng chính

| Nhóm | Bảng | Ghi chú |
|---|---|---|
| Phân quyền | `roles`, `permissions`, `role_permissions`, `user_roles`, `users` | Quyền đọc từ CSDL; seed đồng bộ theo `ROLE_PERMISSIONS` trong `packages/shared` |
| Nội dung | `posts`, `categories`, `media`, `events`, `admission_stats`, `contacts` | `posts.status`: DRAFT → PENDING_REVIEW → SCHEDULED → PUBLISHED (hoặc REJECTED, ARCHIVED) |
| Công việc | `tasks`, `task_reminders` | `tasks.status`: TODO, IN_PROGRESS, DONE, OVERDUE |
| Hệ thống | `system_settings`, `notifications`, `agent_actions`, `audit_logs` | Mọi lần AI Agent gọi tool đều ghi vào `audit_logs` |
| Học vụ *(ngoài ERD, bước 14)* | `school_years`, `semesters`, `grades`, `classes`, `departments`, `subjects`, `rooms`, `teacher_profiles`, `student_profiles`, `class_enrollments`, `activation_codes` | Xem mục bên dưới. **Dữ liệu mẫu trong seed (năm học 2026-2027, môn, lớp 10A1–10A3, giáo viên `GVMAU01`, học sinh `HSMAU01–03`) chỉ để phát triển, không phải dữ liệu thật** |
| Xác thực *(ngoài ERD)* | `refresh_tokens` | Thêm ở F10 (migration `add_refresh_tokens`): refresh token đăng nhập, chỉ lưu bản băm SHA-256, dùng một lần (`revoked_at`) |

**Lệch so với ERD (hình 17), bước 14 – học vụ:** ERD gốc chưa có lớp/năm học/môn, nên thêm 11 bảng (migration `academic_foundation`, cộng `school_year_one_current`):
- `school_years` (tên `2026-2027`, `is_current`; index duy nhất một phần `school_years_one_current` bảo đảm tối đa một năm hiện hành), `semesters` (học kỳ 1/2, duy nhất theo năm), `grades` (khối 10–12), `classes` (model Prisma `SchoolClass`; `UNIQUE (school_year_id, name)`, `homeroom_teacher_id` → `users`, **giáo viên chủ nhiệm không phải vai trò mà suy ra từ cột này**), `departments` (tổ chuyên môn), `subjects` (mã duy nhất, `grading_type` `SCORE`/`COMMENT`), `rooms` (chỉ phòng bộ môn).
- `teacher_profiles` và `student_profiles` (1–1 với `users`, `teacher_code`/`student_code` duy nhất; tên, số điện thoại lấy từ `users`), `class_enrollments` (`UNIQUE (student_id, school_year_id)`: một học sinh một lớp mỗi năm học). Chỉ lưu dữ liệu tối thiểu (ngày sinh, giới tính tuỳ chọn); không lưu gia đình, địa chỉ, CCCD, điểm số.
- `users.email` nay **tuỳ chọn** (học sinh đăng nhập bằng mã học sinh), vẫn duy nhất khi có; `user_status` thêm `PENDING` (chờ kích hoạt, `password_hash` là giá trị không dùng được `!unusable`).
- `activation_codes`: mã kích hoạt dùng một lần, chỉ lưu **HMAC-SHA256** của mã (khoá từ `JWT_ACCESS_SECRET`, gắn với `user_id`), hết hạn sau 14 ngày, `used_at`/`revoked_at`; cấp mã mới thì mã cũ bị thu hồi.
- Môn, tổ, phòng, lớp sẽ được các bước 16–19 tham chiếu bằng khoá ngoại không xoá dây chuyền, nên đã có dữ liệu thì không xoá được.

**Lệch so với ERD (hình 17), bước 11:** bảng `media` thêm `storage_key` (khoá object trong R2/`uploads/`, duy nhất), `status` (`PENDING` → `READY` sau khi server kiểm tra file thật), `kind` (`IMAGE`/`VIDEO`) và `created_at` (để dọn bản ghi chờ quá 1 giờ). `media.url` là URL công khai đầy đủ (R2) hoặc đường dẫn `/media/files/<khoá>` (driver local). Migration `media_r2` đặt các bản ghi cũ thành `READY`, `IMAGE`, `storage_key` = tên file cũ.

**Lệch so với ERD (hình 17):** bảng `refresh_tokens` (thuộc `users`, xoá theo người dùng) không có trong ERD gốc, được thêm để thu hồi được phiên đăng nhập. Token đặt lại mật khẩu không cần bảng: là JWT 30 phút gắn dấu vân tay của `password_hash`, tự mất hiệu lực khi mật khẩu đã đổi.

Quy ước: khoá chính `bigint` tự tăng; cột thời gian `timestamptz` (lưu UTC, hiển thị theo giờ Việt Nam ở giao diện); tên cột snake_case trong CSDL, camelCase trong code.

## 4. Xem và sửa dữ liệu

### Cách 1 – Prisma Studio (dễ nhất)

```powershell
pnpm --filter api db:studio
```

Mở trình duyệt, xem/sửa từng bảng như bảng tính.

### Cách 2 – pgAdmin 4

1. Mở pgAdmin → *Servers* → chuột phải *Register → Server…*
2. Tab *General*: Name `PVH local`.
3. Tab *Connection*: Host `localhost`, Port `5432`, Maintenance database `pvh_eduagent`, Username `pvh`, Password `pvh`.
4. Mở *Databases → pvh_eduagent → Schemas → public → Tables*; chuột phải bảng → *View/Edit Data*. Viết SQL tự do bằng *Tools → Query Tool*.

### Cách 3 – psql (dòng lệnh)

```powershell
& "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U pvh -d pvh_eduagent
```

Lệnh hay dùng trong psql:

| Lệnh | Tác dụng |
|---|---|
| `\l` | Liệt kê CSDL |
| `\dt` | Liệt kê bảng |
| `\d posts` | Xem cấu trúc bảng `posts` |
| `\x auto` | Hiển thị dòng dài theo chiều dọc |
| `\q` | Thoát |

Nếu tiếng Việt bị lỗi font trong psql trên Windows, chạy `chcp 65001` trước khi mở psql.

### Truy vấn mẫu

```sql
-- Số bài viết theo trạng thái
SELECT status, count(*) FROM posts GROUP BY status;

-- Bài đã hẹn giờ, sắp đăng (giờ Việt Nam)
SELECT title, publish_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS dang_luc
FROM posts WHERE status = 'SCHEDULED' ORDER BY publish_at;

-- Việc chưa xong đã quá hạn, kèm người phụ trách
SELECT t.title, u.full_name, t.due_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS han
FROM tasks t JOIN users u ON u.id = t.assignee_id
WHERE t.status <> 'DONE' AND t.due_at < now()
ORDER BY t.due_at;

-- Quyền của một tài khoản
SELECT DISTINCT p.code
FROM users u
JOIN user_roles ur ON ur.user_id = u.id
JOIN role_permissions rp ON rp.role_id = ur.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE u.email = 'bgh@pvh.edu.vn';

-- 20 thao tác gần nhất của AI Agent
SELECT created_at, channel, action, payload
FROM audit_logs WHERE action LIKE 'agent:%'
ORDER BY created_at DESC LIMIT 20;
```

## 5. Thay đổi cấu trúc CSDL (migration)

1. Sửa `apps/api/prisma/schema.prisma` (thêm bảng, cột, index…).
2. Tạo migration, đặt tên mô tả thay đổi:
   ```powershell
   pnpm --filter api db:migrate --name them-cot-x
   ```
   Prisma sinh file SQL trong `prisma/migrations/<thời gian>_them-cot-x/`, chạy nó trên CSDL và sinh lại Prisma Client.
3. Đọc lại file SQL vừa sinh, rồi **commit cả thư mục `prisma/migrations`** vào git.

Quy tắc:
- Không sửa hay xoá migration đã commit; muốn đổi thì tạo migration mới.
- Trên server thật dùng `pnpm --filter api db:deploy` (chỉ áp dụng migration có sẵn, không tạo mới, không xoá dữ liệu).
- Xoá sạch CSDL dev và làm lại từ đầu (mất toàn bộ dữ liệu): `pnpm --filter api db:reset`, sau đó `db:seed`.

## 6. Sao lưu và khôi phục

```powershell
# Sao lưu (định dạng nén của PostgreSQL)
& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -U pvh -d pvh_eduagent -F c -f backup_pvh.dump

# Khôi phục vào CSDL hiện có (xoá đối tượng cũ trước khi tạo lại)
& "C:\Program Files\PostgreSQL\18\bin\pg_restore.exe" -U pvh -d pvh_eduagent --clean --if-exists backup_pvh.dump
```

Không commit file sao lưu lên git vì có thể chứa dữ liệu cá nhân.

## 7. Quản lý dịch vụ PostgreSQL trên Windows

```powershell
Get-Service postgresql-x64-18          # xem trạng thái
Restart-Service postgresql-x64-18      # khởi động lại (PowerShell chạy quyền Administrator)
```

## 8. Lỗi thường gặp

| Lỗi | Cách xử lý |
|---|---|
| `password authentication failed for user "pvh"` | Chưa chạy Bước 1, hoặc sai mật khẩu trong `DATABASE_URL` |
| `database "pvh_eduagent" does not exist` | Chạy lại Bước 1 |
| `Can't reach database server at localhost:5432` | Dịch vụ PostgreSQL đang tắt: `Get-Service postgresql-x64-18` |
| `permission denied to create database` khi `db:migrate` | Tài khoản thiếu `CREATEDB`: `ALTER ROLE pvh CREATEDB;` (chạy bằng `postgres`) |
| API báo `File .env không hợp lệ … DATABASE_URL` | Thiếu hoặc sai dạng `DATABASE_URL` trong `apps/api/.env` |
| Code báo không tìm thấy `src/generated/prisma` | Chạy `pnpm --filter api db:generate` |

## 9. Dùng Docker thay cho PostgreSQL cài sẵn (tuỳ chọn)

`docker-compose.yml` ở thư mục gốc có sẵn PostgreSQL 17 + Redis. Vì PostgreSQL cài trên máy đã chiếm cổng `5432`, nếu muốn dùng Docker hãy đổi cổng trong compose thành `"5433:5432"` và đặt `DATABASE_URL=postgresql://pvh:pvh@localhost:5433/pvh_eduagent`, rồi `pnpm db:up`. Container tự tạo tài khoản và CSDL nên bỏ qua Bước 1.
