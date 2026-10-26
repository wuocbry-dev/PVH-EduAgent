import type { Metadata } from "next";
import { TeachingManager } from "@/features/teaching";

export const metadata: Metadata = { title: "Phân công giảng dạy" };

export default function TeachingPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Phân công giảng dạy</h1>
      <TeachingManager readOnly />
    </div>
  );
}
