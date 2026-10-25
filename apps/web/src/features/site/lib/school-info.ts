// Thông tin trường: docs/01-phan-tich-de-tai.md mục 1 (tổng hợp từ nguồn báo chí công khai).
// Số điện thoại, email, logo... chưa có công khai nên lấy từ bảng system_settings, thiếu thì hiện "Đang cập nhật".

export const SCHOOL_NAME = "Trường THPT Phan Văn Hớn";
export const SCHOOL_SHORT_NAME = "THPT Phan Văn Hớn";
export const DEFAULT_ADDRESS = "Khu tái định cư 38ha, phường Đông Hưng Thuận, TP.HCM";
export const PENDING = "Đang cập nhật";

// Slug chuyên mục dùng cho trang chủ, Thông báo và Tuyển sinh (khớp dữ liệu seed).
export const CATEGORY_NEWS = "tin-tuc";
export const CATEGORY_ANNOUNCEMENTS = "thong-bao";
export const CATEGORY_ADMISSION = "tuyen-sinh";

export const SCHOOL_FACTS: { label: string; value: string }[] = [
  { label: "Loại hình", value: "Trường THPT công lập, trực thuộc Sở Giáo dục và Đào tạo TP.HCM" },
  { label: "Thành lập", value: "Quyết định của UBND TP.HCM, công bố ngày 22/5/2026" },
  { label: "Hiệu trưởng", value: "Ông Nguyễn Duy Bình (nhận quyết định điều động ngày 13/7/2026)" },
  { label: "Năm học đầu tiên", value: "2026–2027, khai giảng sáng 05/9/2026" },
  { label: "Chỉ tiêu lớp 10", value: "810 học sinh" },
  { label: "Điểm chuẩn lớp 10 (2026)", value: "16 điểm" },
];

export const NAME_MEANING = {
  title: "Ý nghĩa tên trường",
  paragraphs: [
    "Trường mang tên Phan Văn Hớn (còn gọi là Phan Công Hớn, khoảng 1830–1886), người nông dân yêu nước, thủ lĩnh cuộc khởi nghĩa Mười Tám Thôn Vườn Trầu chống thực dân Pháp vào tháng 2/1885 tại vùng Bà Điểm – Hóc Môn, cùng với ông Nguyễn Văn Quá.",
    "Đặt tên trường theo vị thủ lĩnh nghĩa quân là cách nhắc nhở thế hệ học sinh về lòng yêu nước, tinh thần dũng cảm và gắn bó với mảnh đất quê hương.",
  ],
};

export const HISTORY = [
  "Trường THPT Phan Văn Hớn là một trong năm trường THPT công lập mới được Ủy ban nhân dân TP.HCM thành lập và công bố vào ngày 22/5/2026, cùng với các trường Lê Thị Riêng, Thoại Ngọc Hầu, Hà Huy Tập và Võ Nguyên Giáp.",
  "Trường đặt tại khu tái định cư 38ha, phường Đông Hưng Thuận (khu vực quận 12 cũ), được xây mới hoàn toàn. Năm học 2026–2027 là năm học đầu tiên, khai giảng sáng 05/9/2026 với chỉ tiêu 810 học sinh khối 10.",
  "Năm học đầu được xác định là “năm đặt nền móng”: ổn định chuyên môn, xây dựng nền nếp và văn hóa trường học; từng bước phát triển giáo dục STEM, môi trường tiếng Anh và tăng cường tiếp cận công nghệ cho học sinh.",
];

export const FACILITIES = [
  "Trường được xây mới hoàn toàn; trong năm học đầu tiên một số hạng mục vẫn đang tiếp tục hoàn thiện.",
  "Thông tin chi tiết về phòng học, phòng chức năng, thư viện và khuôn viên sẽ được cập nhật khi nhà trường công bố.",
];
