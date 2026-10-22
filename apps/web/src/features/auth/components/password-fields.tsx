import { PASSWORD_MIN_LENGTH } from "@pvh/shared";
import { inputClass } from "./form-styles";

// Mật khẩu mới + nhập lại; kiểm tra khớp bằng readNewPassword().
export function NewPasswordFields() {
  return (
    <>
      <label className="block space-y-1 text-sm">
        <span>Mật khẩu mới (ít nhất {PASSWORD_MIN_LENGTH} ký tự)</span>
        <input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          className={inputClass}
        />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Nhập lại mật khẩu mới</span>
        <input name="confirmPassword" type="password" autoComplete="new-password" required className={inputClass} />
      </label>
    </>
  );
}

export function readNewPassword(form: FormData): string {
  const newPassword = String(form.get("newPassword"));
  if (newPassword !== form.get("confirmPassword")) {
    throw new Error("Mật khẩu nhập lại không khớp");
  }
  return newPassword;
}
