import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthHeading, LoginForm } from "@/features/auth";
import { Skeleton } from "@/shared/ui";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <>
      <AuthHeading title="Đăng nhập">Dùng tài khoản nhà trường cấp cho học sinh, giáo viên và cán bộ.</AuthHeading>
      <Suspense fallback={<Skeleton lines={4} />}>
        <LoginForm />
      </Suspense>
    </>
  );
}
