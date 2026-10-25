import type { Metadata } from "next";
import { RoleMatrix } from "@/features/users";

export const metadata: Metadata = { title: "Vai trò và quyền" };

export default function RolesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Vai trò và quyền</h1>
      <RoleMatrix />
    </div>
  );
}
