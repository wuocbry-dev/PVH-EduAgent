# Hướng dẫn chạy Redis và bộ lập lịch (BullMQ)

Bộ lập lịch (`apps/api/src/features/scheduler`) dùng **Redis + BullMQ** cho ba việc:

| Mã | Việc | Cách chạy |
|---|---|---|
| A05 | Tự đăng bài hẹn giờ | Mỗi bài `SCHEDULED` có một job trễ đến `publish_at` (jobId `post-<id>`, retry 3 lần, backoff mũ). Thêm job quét bù mỗi phút và quét bù khi API khởi động. |
| A06 | Nhắc hạn chót, đánh dấu `OVERDUE` | Job lặp mỗi 5 phút. Nhắc trước X giờ (`reminder.hours_before`, mặc định 24) và khi quá hạn; mỗi mốc chỉ nhắc một lần (`task_reminders`, unique `task_id + remind_type`). |
| A09 | Báo cáo hằng ngày cho ADMIN/BGH | Job lặp theo `report.daily_time` (mặc định `07:00`, giờ `Asia/Ho_Chi_Minh`). Đổi giờ ở `/admin/cau-hinh` thì đăng ký lại ngay. |

Kết quả được ghi vào bảng `notifications` (chưa gửi, `sent_at` rỗng) và `audit_logs` với `channel = scheduler`.
Việc gửi qua Telegram thuộc bước 8.

## Bật Redis

Cách 1 – Docker Compose của dự án (chỉ Redis, PostgreSQL vẫn dùng bản cài trên máy):

```bash
docker compose up -d redis
```

Cách 2 – dùng một container Redis có sẵn: chỉ cần nó lắng nghe cổng 6379. Kiểm tra:

```bash
docker ps --filter publish=6379
```

Khai báo trong `apps/api/.env`:

```env
REDIS_URL=redis://localhost:6379
# Tiền tố khóa BullMQ (mặc định pvh). Đổi nếu nhiều môi trường dùng chung một Redis.
BULLMQ_PREFIX=pvh
```

## Khi không có Redis

Để trống `REDIS_URL` thì **bộ lập lịch tự tắt** (API ghi cảnh báo lúc khởi động và vẫn chạy bình thường):
duyệt, hẹn giờ vẫn lưu được nhưng bài chưa tự đăng. Khi bật lại Redis và khởi động API, các bài đã quá giờ
được đăng bù và các job còn thiếu được dựng lại từ CSDL. Dashboard `/admin` và tool `get_system_status`
của AI Agent hiển thị tình trạng hàng đợi.

## Kiểm tra bằng tay

1. Đăng nhập biên tập viên, tạo bài, gửi duyệt, rồi **Duyệt & hẹn giờ** vào 1–2 phút sau.
2. Chờ đến giờ: bài chuyển `Đã đăng` và có dòng `post.publish` (kênh Bộ lập lịch) ở `/admin/nhat-ky`.
3. Thử tắt rồi bật lại API trước giờ đăng: lịch không mất vì job nằm trong Redis và được dựng lại từ CSDL.

## Chạy test

`pnpm test` cần PostgreSQL và Redis đang chạy. Mỗi lần chạy e2e dùng tiền tố BullMQ riêng
(`pvh-test-<thời điểm>`) nên không đụng hàng đợi của API đang chạy trên máy, và được dọn sạch khi xong.
