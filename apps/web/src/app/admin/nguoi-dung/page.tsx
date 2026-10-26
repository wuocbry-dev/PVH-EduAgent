import type { Metadata } from "next";
import { UserManager } from "@/features/users";

export const metadata: Metadata = { title: "Người dùng" };

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold print:hidden">Người dùng</h1>
      <UserManager />
    </div>
  );
}
