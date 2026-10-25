import type { Metadata } from "next";
import { SettingsForm } from "@/features/settings";

export const metadata: Metadata = { title: "Cấu hình hệ thống" };

export default function SettingsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Cấu hình hệ thống</h1>
      <SettingsForm />
    </div>
  );
}
