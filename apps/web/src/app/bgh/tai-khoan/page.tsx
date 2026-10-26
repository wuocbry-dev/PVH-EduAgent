import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountInfo } from "@/features/auth";
import { TelegramLinkCard } from "@/features/telegram";

export const metadata: Metadata = { title: "Tài khoản" };

export default function AccountPage() {
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-bold">Tài khoản</h1>
      <Suspense fallback={<p className="text-sm opacity-70">Đang tải…</p>}>
        <AccountInfo portal="bgh" />
      </Suspense>
      <TelegramLinkCard />
    </div>
  );
}
