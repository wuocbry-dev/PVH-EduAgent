import type { Metadata } from "next";
import { ChangePasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

export default function ChangePasswordPage() {
  return (
    <div className="max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Đổi mật khẩu</h1>
      <ChangePasswordForm />
    </div>
  );
}
