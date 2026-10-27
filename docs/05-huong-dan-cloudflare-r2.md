# Hướng dẫn Cloudflare R2 (lưu ảnh và video)

Ảnh/video của website được lưu ở **Cloudflare R2** (API tương thích S3). Trình duyệt tải file **thẳng lên R2** bằng URL ký sẵn; API chỉ cấp URL, rồi kiểm tra lại file. Khi chưa có R2 (dev, test) dùng `STORAGE_DRIVER=local`: file lưu ở thư mục `UPLOAD_DIR`, luồng tải lên vẫn giống hệt.

```
Trình duyệt ──POST /media/presign──▶ API  (kiểm quyền post:create, tạo bản ghi PENDING, ký URL 10 phút)
Trình duyệt ──PUT file────────────▶ R2   (ký cả Content-Type và Content-Length)
Trình duyệt ──POST /media/:id/complete──▶ API ──HEAD + đọc vài byte đầu──▶ R2
                                         đúng kích thước & đúng loại (magic bytes) → READY
                                         sai → xoá object + bản ghi, trả lỗi
```

Giới hạn: ảnh JPEG/PNG/WebP/GIF ≤ 10 MB (không nhận SVG); video MP4/WebM ≤ 100 MB. Hằng số ở `packages/shared/src/posts.ts`. Bản ghi chờ quá 1 giờ chưa hoàn tất bị job BullMQ `media-cleanup` (mỗi 15 phút) xoá cùng object mồ côi.

## 1. Tạo bucket và khoá API

1. Đăng nhập dash.cloudflare.com → **R2 Object Storage** → bật R2 (Cloudflare có thể yêu cầu phương thức thanh toán; gói miễn phí hiện có 10 GB lưu trữ, 1 triệu thao tác ghi, 10 triệu thao tác đọc mỗi tháng, tải xuống không tính phí egress – kiểm tra lại trang giá của Cloudflare).
2. **Create bucket** (vd. `pvh-media`).
3. **Manage R2 API Tokens → Create API token**, quyền **Object Read & Write**, giới hạn đúng bucket đó. Trang kết quả hiện một lần duy nhất: *Access Key ID*, *Secret Access Key* và địa chỉ endpoint `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` (phần `<ACCOUNT_ID>` là Account ID, 32 ký tự hex). Token loại *Account API token* có thời điểm bắt đầu hiệu lực (trường *TTL*/*Active after*): trước thời điểm đó Cloudflare trả `401`.
4. Không dán khoá vào ảnh chụp, chat hay git. Nếu lỡ lộ: tạo lại (roll) token trong dashboard.

## 2. Truy cập công khai

Bucket → **Settings**:

- Chạy thử: bật **Public Development URL** (`https://pub-….r2.dev`), gõ `allow`. Địa chỉ này bị giới hạn tốc độ, **chỉ dùng để dev**.
- Dùng thật: gắn **Custom Domain** (tên miền nằm trên Cloudflare), vd. `https://media.pvh.edu.vn`. Production từ chối khởi động nếu `R2_PUBLIC_BASE_URL` không phải `https://`.

## 3. CORS (để trình duyệt PUT được)

Bucket → Settings → **CORS policy**:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```

Khi triển khai, đổi `AllowedOrigins` thành địa chỉ website thật (cùng giá trị `WEB_ORIGIN`).

## 4. Cấu hình API

Trong `apps/api/.env` (không commit):

```env
STORAGE_DRIVER=r2
R2_ACCOUNT_ID=<32 ký tự hex>
R2_ACCESS_KEY_ID=<Access Key ID>
R2_SECRET_ACCESS_KEY=<Secret Access Key>
R2_BUCKET=pvh-media
R2_PUBLIC_BASE_URL=https://pub-xxxx.r2.dev   # không có dấu / ở cuối
```

Thiếu một biến thì API không khởi động (báo rõ biến nào). Khoá chỉ nằm trong bộ nhớ của API: không ghi log, không vào `system_settings`, không có trong phản hồi.

Với `STORAGE_DRIVER=r2`: `GET /media/files/:name` và `PUT /media/local-upload/:id` trả 404 (file được phục vụ thẳng từ địa chỉ công khai của bucket).

## 4b. Bucket riêng tư cho thư viện số (bước 21)

File tài liệu của thư viện số (PDF, sách nói MP3, video) **không được công khai**: chỉ người đăng nhập, đúng đối tượng mới đọc được, qua URL ký sẵn hết hạn sau **5 phút** do API cấp sau khi kiểm tra quyền. Vì vậy dùng một bucket thứ hai:

1. **Create bucket** (vd. `pvh-library`). **Không** bật Public Development URL (`r2.dev`) và **không** gắn Custom Domain cho bucket này.
2. Token API: nếu token hiện có chỉ được phép trên một bucket thì sửa token (hoặc tạo token mới) để có quyền **Object Read & Write** trên cả `pvh-library`. Dùng chung `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`.
3. CORS của `pvh-library` (trình duyệt PUT file lên; trang web tải PDF bằng `fetch` để hiển thị bằng pdf.js; trình phát âm thanh/video đọc thẳng URL ký sẵn):

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

4. `apps/api/.env`: thêm `R2_PRIVATE_BUCKET=pvh-library` (phải khác `R2_BUCKET`). Thiếu biến này thì máy dev nhắc trong log và lưu tài liệu ở thư mục `PRIVATE_UPLOAD_DIR` (mặc định `uploads-private/`, không được phục vụ công khai); **production từ chối khởi động**.

Giới hạn file: PDF ≤ 50 MB, MP3 ≤ 100 MB, MP4/WebM ≤ 100 MB (`LIBRARY_MAX_BYTES` ở `packages/shared/src/library.ts`); loại thật được nhận dạng bằng magic bytes, sai thì object bị xoá. **Gói miễn phí R2 chỉ 10 GB** (tính chung mọi bucket): video bài giảng nhanh đầy dung lượng, nên nén video (720p) và theo dõi mục *Metrics* của bucket.

Lưu ý: ẩn nút "Tải về" chỉ **hạn chế**, không ngăn được sao chép hoàn toàn (người đã được đọc vẫn có thể lưu dữ liệu trong 5 phút hiệu lực của URL, hay chụp màn hình). Đừng đưa lên thư viện tài liệu không được phép chia sẻ.

## 5. Chuyển ảnh cũ trong `uploads/` lên R2

Chạy một lần sau khi cấu hình xong mục 4 (đổi `STORAGE_DRIVER=r2` có thể làm trước hoặc sau):

```powershell
pnpm --filter api media:migrate --dry-run   # chỉ in ra việc sẽ làm, không đổi gì
pnpm --filter api media:migrate             # chạy thật
```

Script đẩy từng file trong `UPLOAD_DIR` lên R2 với đúng khoá cũ, đổi `media.url`, rồi thay mọi URL cũ (`/media/files/<khoá>`, kể cả dạng tuyệt đối `<địa chỉ API>/media/files/<khoá>`) trong `posts.content` và `posts.thumbnail_url` bằng URL mới. Chạy lại không làm hỏng dữ liệu (file đã có trên R2 không đẩy lại, URL đã đổi không đổi lần nữa). File có bản ghi nhưng không còn trên đĩa được liệt kê ở cuối (mã thoát 2) và giữ nguyên URL cũ để xử lý tay.

## 6. Xử lý sự cố

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| Tải lên báo lỗi mạng / `CORS` trong console trình duyệt | CORS của bucket thiếu `PUT` hoặc sai `AllowedOrigins` |
| `403 SignatureDoesNotMatch` khi PUT | Trình duyệt gửi `Content-Type` khác với đã khai báo; hoặc đồng hồ máy chủ API lệch giờ nhiều |
| `401` khi API gọi R2 | Sai khoá, sai Account ID, hoặc token chưa tới thời điểm hiệu lực (*Active after*) |
| `403 AccessDenied` khi PUT/xoá nhưng HEAD/đọc được | Token chỉ có quyền đọc: tạo token **Object Read & Write** (hoặc *Admin Read & Write*) cho đúng bucket |
| Tải lên thành công nhưng ảnh không hiện | Bucket chưa bật truy cập công khai, hoặc `R2_PUBLIC_BASE_URL` sai |
| `complete` báo "Nội dung file không đúng loại" | File đổi đuôi (vd. đổi tên `.mov` thành `.mp4`); chỉ nhận MP4 chuẩn (brand isom/mp42/…) và WebM |
