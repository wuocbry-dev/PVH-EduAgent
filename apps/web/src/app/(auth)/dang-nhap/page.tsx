import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/features/auth";

export const metadata: Metadata = { title: "Đăng nhập" };

export default function LoginPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Đăng nhập quản trị</h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
