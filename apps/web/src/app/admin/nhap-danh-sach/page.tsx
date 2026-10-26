import type { Metadata } from "next";
import { RosterImport } from "@/features/roster";

export const metadata: Metadata = { title: "Nhập danh sách" };

export default function RosterImportPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold print:hidden">Nhập danh sách giáo viên / học sinh</h1>
      <RosterImport />
    </div>
  );
}
