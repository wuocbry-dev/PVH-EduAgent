import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default function ResetPasswordPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Đặt lại mật khẩu</h1>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
