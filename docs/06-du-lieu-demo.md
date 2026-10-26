# Dữ liệu demo – xem thử các chức năng

> Đây là dữ liệu **giả** để thử trên máy phát triển, không phải dữ liệu thật của trường. Tên người được sinh ngẫu nhiên.

## Tạo, làm lại, xoá

Chạy ở thư mục gốc, sau khi đã `pnpm db:migrate` và `pnpm db:seed`:

| Lệnh | Việc |
|---|---|
| `pnpm --filter api db:seed-demo` | Tạo dữ liệu demo (chỉ chạy một lần, đã có thì báo và dừng) |
| `pnpm --filter api db:seed-demo --reset` | Xoá dữ liệu demo rồi tạo lại từ đầu |
| `pnpm --filter api db:seed-demo --reset --only` | Chỉ xoá dữ liệu demo |

Lệnh xoá chỉ đụng đúng dữ liệu demo (tài khoản `GV<MÔN>1–3`, học sinh `HS26…`, 7 lớp thêm, phiên bản TKB, điểm, thông báo… do script tạo). Tài khoản seed gốc, bài viết bạn tự tạo được giữ nguyên. Nếu bạn đã dùng tài khoản demo để tạo bài viết hoặc tải ảnh lên thì lệnh xoá sẽ báo lỗi khoá ngoại và không xoá gì.

**Mật khẩu chung của mọi tài khoản: `Pvh@2026`.** Đăng nhập bằng email **hoặc** mã (giáo viên `GVTOAN1`, học sinh `HS260001`).

## Có gì trong dữ liệu demo

| Phần | Nội dung |
|---|---|
| Lớp | 10 lớp: 10A1–10A4, 11A1–11A3, 12A1–12A3 (năm học 2026–2027) |
| Giáo viên | 3 giáo viên mỗi môn × 15 môn = 45 tài khoản, mỗi người dạy 3–4 lớp, 9 lớp có chủ nhiệm |
| Học sinh | 6 em mỗi lớp (`HS260001`–`HS260060`) + 3 em mẫu cũ `HSMAU01–03` |
| Phân công | Đủ 15 môn cho cả 10 lớp (150 phân công, cả năm). Định mức tiết khối 11, 12 chép từ khối 10 |
| Tiết bận | Giáo viên số 3 của mỗi môn bận chiều thứ Năm (tiết 6–7) và thứ Sáu (tiết 8–9) |
| Thời khoá biểu HK I | **Bản đã công bố** xếp đủ 32 tiết/lớp (320 tiết, áp dụng từ 07/09/2026). **Bản nháp "thử xếp lại"**: chỉ có tiết buổi sáng, lớp 12A3 trống, để bạn tự xếp |
| Điểm HK I | Thường xuyên đủ số cột theo TT22 (khối 12 thiếu 1 cột), đã công bố. Giữa kỳ: khối 10–11 đã công bố; khối 12 còn nháp, mỗi lớp thiếu 2 em, 12A3 chưa nhập Toán và Ngữ văn. Hạn nhập giữa kỳ 07/11/2026 |
| Thông báo | Toàn trường (ghim), khối 10, khối 12, lớp 10A2 (do chủ nhiệm gửi), chỉ giáo viên |
| Sự kiện, công việc | 4 sự kiện theo đối tượng (trường, khối 11, lớp 10A2, giáo viên); 4 việc giao cho giáo viên và biên tập |

## Nên thử gì với tài khoản nào

| Vai trò | Đăng nhập | Thử |
|---|---|---|
| Quản trị | `admin@pvh.edu.vn` | `/admin`: danh sách người dùng (lọc vai trò Giáo viên/Học sinh), lớp/môn/phòng, nhập Excel, phân quyền, nhật ký |
| Ban giám hiệu | `bgh@pvh.edu.vn` | Phân công giảng dạy (cảnh báo định mức), **thời khoá biểu**: mở bản nháp, xếp tiết cho 12A3, thử đặt trùng giáo viên/phòng Tin, xếp vào tiết bận của giáo viên số 3, công bố. Tiến độ nhập điểm giữa kỳ khối 12, thống kê điểm, khoá sổ, gửi thông báo |
| Giáo viên | `gv.toan2@pvh.edu.vn` | Lịch dạy, sổ điểm 10A2/11A1/12A1, nhập điểm giữa kỳ khối 12 còn thiếu, **lớp chủ nhiệm 11A2**, gửi thông báo cho lớp |
| Giáo viên có tiết bận | `gv.toan3@pvh.edu.vn` | Xem/sửa tiết bận đã đăng ký |
| Chủ nhiệm 10A2 | `gv.li1@pvh.edu.vn` | Lớp chủ nhiệm, thông báo đã gửi cho 10A2 |
| Học sinh | `HS260007` (lớp 10A2) | Trang của em, thời khoá biểu, điểm (chỉ thấy điểm đã công bố), thông báo toàn trường + khối 10 + lớp 10A2, lịch |
| Học sinh khối 12 | `HS260055` (lớp 12A3) | Điểm giữa kỳ chưa công bố nên chưa hiện; ĐTB tạm tính báo thiếu cột |
| Biên tập | `bientap@pvh.edu.vn` | Bài viết, chuyên mục, liên hệ, lịch |

Toán và Tin học của 10A1 do giáo viên mẫu cũ `gv.toan@pvh.edu.vn` (GVMAU01) dạy, nên `GVTOAN1`, `GVTIN1` chỉ có 3 lớp.

## Giáo viên (45 tài khoản demo)

| Môn | Mã đăng nhập | Email | Họ tên | Dạy lớp | Chủ nhiệm / ghi chú |
|---|---|---|---|---|---|
| Toán | GVTOAN1 | gv.toan1@pvh.edu.vn | Bùi Quốc Quân | 10A4, 11A3, 12A3 |  |
| Toán | GVTOAN2 | gv.toan2@pvh.edu.vn | Lê Hữu An | 10A2, 11A1, 12A1 | 11A2 |
| Toán | GVTOAN3 | gv.toan3@pvh.edu.vn | Phan Hữu Thịnh | 10A3, 11A2, 12A2 | *có tiết bận* |
| Tin học | GVTIN1 | gv.tin1@pvh.edu.vn | Vũ Thanh Quyên | 10A4, 11A3, 12A3 | 12A2 |
| Tin học | GVTIN2 | gv.tin2@pvh.edu.vn | Dương Thanh Khang | 10A2, 11A1, 12A1 |  |
| Tin học | GVTIN3 | gv.tin3@pvh.edu.vn | Phan Hoài Hạnh | 10A3, 11A2, 12A2 | *có tiết bận* |
| Ngữ văn | GVVAN1 | gv.van1@pvh.edu.vn | Hồ Phương Nhi | 10A1, 10A4, 11A3, 12A3 | 10A3 |
| Ngữ văn | GVVAN2 | gv.van2@pvh.edu.vn | Đỗ Bảo Châu | 10A2, 11A1, 12A1 |  |
| Ngữ văn | GVVAN3 | gv.van3@pvh.edu.vn | Phạm Hoài Hà | 10A3, 11A2, 12A2 | *có tiết bận* |
| Tiếng Anh | GVANH1 | gv.anh1@pvh.edu.vn | Phạm Đức Vinh | 10A1, 10A4, 11A3, 12A3 | 10A4 |
| Tiếng Anh | GVANH2 | gv.anh2@pvh.edu.vn | Vũ Văn Hiếu | 10A2, 11A1, 12A1 |  |
| Tiếng Anh | GVANH3 | gv.anh3@pvh.edu.vn | Ngô Hoàng Tuấn | 10A3, 11A2, 12A2 | *có tiết bận* |
| Lịch sử | GVSU1 | gv.su1@pvh.edu.vn | Lê Bảo Tâm | 10A1, 10A4, 11A3, 12A3 | 11A3 |
| Lịch sử | GVSU2 | gv.su2@pvh.edu.vn | Vũ Ngọc Anh | 10A2, 11A1, 12A1 |  |
| Lịch sử | GVSU3 | gv.su3@pvh.edu.vn | Đặng Phương Lan | 10A3, 11A2, 12A2 | *có tiết bận* |
| Địa lí | GVDIA1 | gv.dia1@pvh.edu.vn | Lê Thanh Ngân | 10A1, 10A4, 11A3, 12A3 | 12A3 |
| Địa lí | GVDIA2 | gv.dia2@pvh.edu.vn | Huỳnh Đức Phát | 10A2, 11A1, 12A1 |  |
| Địa lí | GVDIA3 | gv.dia3@pvh.edu.vn | Đỗ Hữu Sơn | 10A3, 11A2, 12A2 | *có tiết bận* |
| Giáo dục kinh tế và pháp luật | GVGDKTPL1 | gv.gdktpl1@pvh.edu.vn | Dương Hữu Long | 10A1, 10A4, 11A3, 12A3 |  |
| Giáo dục kinh tế và pháp luật | GVGDKTPL2 | gv.gdktpl2@pvh.edu.vn | Võ Đức Thịnh | 10A2, 11A1, 12A1 |  |
| Giáo dục kinh tế và pháp luật | GVGDKTPL3 | gv.gdktpl3@pvh.edu.vn | Đỗ Thanh Hiếu | 10A3, 11A2, 12A2 | *có tiết bận* |
| Vật lí | GVLI1 | gv.li1@pvh.edu.vn | Dương Hữu Nam | 10A1, 10A4, 11A3, 12A3 | 10A2 |
| Vật lí | GVLI2 | gv.li2@pvh.edu.vn | Phan Minh Khoa | 10A2, 11A1, 12A1 |  |
| Vật lí | GVLI3 | gv.li3@pvh.edu.vn | Vũ Thanh Hạnh | 10A3, 11A2, 12A2 | *có tiết bận* |
| Hóa học | GVHOA1 | gv.hoa1@pvh.edu.vn | Phạm Thanh Châu | 10A1, 10A4, 11A3, 12A3 | 11A1 |
| Hóa học | GVHOA2 | gv.hoa2@pvh.edu.vn | Lê Thị Vy | 10A2, 11A1, 12A1 |  |
| Hóa học | GVHOA3 | gv.hoa3@pvh.edu.vn | Phạm Thị Anh | 10A3, 11A2, 12A2 | *có tiết bận* |
| Sinh học | GVSINH1 | gv.sinh1@pvh.edu.vn | Lê Quốc An | 10A1, 10A4, 11A3, 12A3 | 12A1 |
| Sinh học | GVSINH2 | gv.sinh2@pvh.edu.vn | Nguyễn Gia An | 10A2, 11A1, 12A1 |  |
| Sinh học | GVSINH3 | gv.sinh3@pvh.edu.vn | Đỗ Bảo Ngân | 10A3, 11A2, 12A2 | *có tiết bận* |
| Công nghệ | GVCNGHE1 | gv.cnghe1@pvh.edu.vn | Dương Phương Ngân | 10A1, 10A4, 11A3, 12A3 |  |
| Công nghệ | GVCNGHE2 | gv.cnghe2@pvh.edu.vn | Lý Kim Hạnh | 10A2, 11A1, 12A1 |  |
| Công nghệ | GVCNGHE3 | gv.cnghe3@pvh.edu.vn | Hồ Thanh Nam | 10A3, 11A2, 12A2 | *có tiết bận* |
| Giáo dục thể chất | GVGDTC1 | gv.gdtc1@pvh.edu.vn | Vũ Kim Hà | 10A1, 10A4, 11A3, 12A3 |  |
| Giáo dục thể chất | GVGDTC2 | gv.gdtc2@pvh.edu.vn | Đặng Phương Tâm | 10A2, 11A1, 12A1 |  |
| Giáo dục thể chất | GVGDTC3 | gv.gdtc3@pvh.edu.vn | Nguyễn Văn Bình | 10A3, 11A2, 12A2 | *có tiết bận* |
| Giáo dục quốc phòng và an ninh | GVGDQPAN1 | gv.gdqpan1@pvh.edu.vn | Lê Kim Thảo | 10A1, 10A4, 11A3, 12A3 |  |
| Giáo dục quốc phòng và an ninh | GVGDQPAN2 | gv.gdqpan2@pvh.edu.vn | Trần Ngọc Quyên | 10A2, 11A1, 12A1 |  |
| Giáo dục quốc phòng và an ninh | GVGDQPAN3 | gv.gdqpan3@pvh.edu.vn | Đỗ Đức Long | 10A3, 11A2, 12A2 | *có tiết bận* |
| Hoạt động trải nghiệm, hướng nghiệp | GVHDTNHN1 | gv.hdtnhn1@pvh.edu.vn | Bùi Ngọc Linh | 10A1, 10A4, 11A3, 12A3 |  |
| Hoạt động trải nghiệm, hướng nghiệp | GVHDTNHN2 | gv.hdtnhn2@pvh.edu.vn | Ngô Đức Sơn | 10A2, 11A1, 12A1 |  |
| Hoạt động trải nghiệm, hướng nghiệp | GVHDTNHN3 | gv.hdtnhn3@pvh.edu.vn | Lê Ngọc Mai | 10A3, 11A2, 12A2 | *có tiết bận* |
| Nội dung giáo dục của địa phương | GVGDDP1 | gv.gddp1@pvh.edu.vn | Võ Hoài Tâm | 10A1, 10A4, 11A3, 12A3 |  |
| Nội dung giáo dục của địa phương | GVGDDP2 | gv.gddp2@pvh.edu.vn | Bùi Thu Vy | 10A2, 11A1, 12A1 |  |
| Nội dung giáo dục của địa phương | GVGDDP3 | gv.gddp3@pvh.edu.vn | Bùi Phương Anh | 10A3, 11A2, 12A2 | *có tiết bận* |

## Học sinh

| Lớp | Mã học sinh |
|---|---|
| 10A1 | HS260001, HS260002, HS260003, HS260004, HS260005, HS260006, HSMAU01, HSMAU02 |
| 10A2 | HS260007, HS260008, HS260009, HS260010, HS260011, HS260012, HSMAU03 |
| 10A3 | HS260013, HS260014, HS260015, HS260016, HS260017, HS260018 |
| 10A4 | HS260019, HS260020, HS260021, HS260022, HS260023, HS260024 |
| 11A1 | HS260025, HS260026, HS260027, HS260028, HS260029, HS260030 |
| 11A2 | HS260031, HS260032, HS260033, HS260034, HS260035, HS260036 |
| 11A3 | HS260037, HS260038, HS260039, HS260040, HS260041, HS260042 |
| 12A1 | HS260043, HS260044, HS260045, HS260046, HS260047, HS260048 |
| 12A2 | HS260049, HS260050, HS260051, HS260052, HS260053, HS260054 |
| 12A3 | HS260055, HS260056, HS260057, HS260058, HS260059, HS260060 |
