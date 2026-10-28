import type { Metadata } from "next";
import { AuthHeading, ForgotPasswordForm } from "@/features/auth";

export const metadata: Metadata = { title: "Quên mật khẩu" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading title="Quên mật khẩu" />
      <ForgotPasswordForm />
    </>
  );
}
