// Chế độ sáng/tối (bước 29). Lựa chọn lưu ở localStorage (không dùng cookie: đọc cookie ở layout gốc làm mọi trang thành
// động và hỏng `use cache` của trang công khai). data-theme trên <html> luôn là giá trị đã quy đổi: "light" | "dark".
export const THEME_STORAGE_KEY = "pvh-theme";
// Sự kiện báo các nút gạt khác trên cùng trang (header và ngăn kéo) cập nhật theo.
export const THEME_EVENT = "pvh-theme-change";
export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

// Chạy đồng bộ trong <head> trước khi vẽ trang để không chớp trắng. Giữ ngắn, không phụ thuộc gì.
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_STORAGE_KEY}");var d=c==="dark"||(c!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}})()`;

export function readThemeChoice(): ThemeChoice {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const dark = choice === "dark" || (choice === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

export function saveThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Trình duyệt chặn bộ nhớ: vẫn đổi được trong phiên hiện tại.
  }
  applyTheme(choice);
  window.dispatchEvent(new CustomEvent<ThemeChoice>(THEME_EVENT, { detail: choice }));
}
