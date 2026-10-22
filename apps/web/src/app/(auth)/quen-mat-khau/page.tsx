import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Quên mật khẩu</h1>
      <ForgotPasswordForm />
    </div>
  );
}
