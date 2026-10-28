import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, ResetPasswordForm } from "@/features/auth";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Đặt lại mật khẩu" };

export default function ResetPasswordPage() {
  return (
    <>
      <AuthHeading title="Đặt lại mật khẩu" />
      <Suspense fallback={<Skeleton lines={3} />}>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
