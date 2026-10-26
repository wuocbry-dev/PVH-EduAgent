import type { Metadata } from "next";
import { ActivationForm } from "@/features/auth";

export const metadata: Metadata = { title: "Kích hoạt tài khoản" };

export default function ActivationPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Kích hoạt tài khoản</h1>
      <p className="text-sm opacity-70">
        Nhập mã đăng nhập và mã kích hoạt trên phiếu tài khoản, rồi đặt mật khẩu của riêng bạn. Mã kích hoạt chỉ dùng được một lần.
      </p>
      <ActivationForm />
    </div>
  );
}
