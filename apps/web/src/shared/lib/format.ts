const TIME_ZONE = "Asia/Ho_Chi_Minh";

// Giờ hiển thị theo Asia/Ho_Chi_Minh; API lưu và trả về ISO string (UTC).
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: TIME_ZONE });

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: TIME_ZONE });
