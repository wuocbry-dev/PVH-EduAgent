import type { Metadata } from "next";
import { ActivationForm, AuthHeading } from "@/features/auth";

export const metadata: Metadata = { title: "Kích hoạt tài khoản" };

export default function ActivationPage() {
  return (
    <>
      <AuthHeading title="Kích hoạt tài khoản">
        Nhập mã đăng nhập và mã kích hoạt trên phiếu tài khoản, rồi đặt mật khẩu của riêng bạn. Mã kích hoạt chỉ dùng được một lần.
      </AuthHeading>
      <ActivationForm />
    </>
  );
}
