const TIME_ZONE = "Asia/Ho_Chi_Minh";

// Giờ hiển thị theo Asia/Ho_Chi_Minh; API lưu và trả về ISO string (UTC).
export const formatDate = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: TIME_ZONE });

export const formatDateTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: TIME_ZONE });

const pad = (n: number) => String(n).padStart(2, "0");

// ISO (UTC) → giá trị cho <input type="datetime-local"> theo giờ địa phương của trình duyệt.
export function toDateTimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Giá trị <input type="datetime-local"> (giờ địa phương, không kèm múi giờ) → ISO UTC gửi lên API.
export const fromDateTimeLocal = (value: string) => new Date(value).toISOString();
