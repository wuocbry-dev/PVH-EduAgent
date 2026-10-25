import type { Metadata } from "next";
import { ContactManager } from "@/features/contacts";

export const metadata: Metadata = { title: "Liên hệ" };

export default function AdminContactsPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Liên hệ từ website</h1>
      <ContactManager />
    </div>
  );
}
