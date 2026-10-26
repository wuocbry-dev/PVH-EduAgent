import type { Metadata } from "next";
import { HomeroomClass } from "@/features/academic";

export const metadata: Metadata = { title: "Lớp chủ nhiệm" };

export default function HomeroomPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold print:hidden">Lớp chủ nhiệm</h1>
      <HomeroomClass />
    </div>
  );
}
