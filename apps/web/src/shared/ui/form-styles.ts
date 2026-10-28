// Lớp mỏng cho các form viết trước bước 29 (khoảng 50 file dùng `className={inputClass}` trên <input>/<select>/<textarea>
// gốc). Giá trị đã là kiểu mới (token, rounded-xl); code mới dùng thẳng Input/Select/Textarea/Button ở src/shared/ui.
import { buttonStyles } from "./button";
import { errorClass, fieldClass } from "./field";

export const inputClass = fieldClass;
export const buttonClass = buttonStyles({ full: true });
export { errorClass };
