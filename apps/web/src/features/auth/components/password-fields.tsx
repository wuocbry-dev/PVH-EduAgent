import { PASSWORD_MIN_LENGTH } from "@pvh/shared";
import { PasswordInput } from "@/shared/ui";

// Mật khẩu mới + nhập lại; kiểm tra khớp bằng readNewPassword().
export function NewPasswordFields() {
  return (
    <>
      <div className="space-y-1.5 text-sm font-medium">
        <label htmlFor="mat-khau-moi" className="block">
          Mật khẩu mới (ít nhất {PASSWORD_MIN_LENGTH} ký tự)
        </label>
        <PasswordInput id="mat-khau-moi" name="newPassword" autoComplete="new-password" minLength={PASSWORD_MIN_LENGTH} required />
      </div>
      <div className="space-y-1.5 text-sm font-medium">
        <label htmlFor="nhap-lai-mat-khau" className="block">
          Nhập lại mật khẩu mới
        </label>
        <PasswordInput id="nhap-lai-mat-khau" name="confirmPassword" autoComplete="new-password" required />
      </div>
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
