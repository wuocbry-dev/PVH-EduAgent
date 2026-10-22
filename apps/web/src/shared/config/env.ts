export const env = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api",
  // Hiện ô chọn vai trò ở trang Trợ lý AI; chỉ có tác dụng khi API chạy dev với DEV_AUTH=true.
  devAuth: process.env.NEXT_PUBLIC_DEV_AUTH === "true",
};
