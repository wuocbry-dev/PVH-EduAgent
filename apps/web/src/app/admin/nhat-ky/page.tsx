import type { Metadata } from "next";
import { AuditLogViewer } from "@/features/audit";

export const metadata: Metadata = { title: "Nhật ký hoạt động" };

export default function AuditLogPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Nhật ký hoạt động</h1>
      <AuditLogViewer />
    </div>
  );
}
