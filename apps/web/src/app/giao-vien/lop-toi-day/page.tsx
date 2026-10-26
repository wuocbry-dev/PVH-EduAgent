import type { Metadata } from "next";
import { MyClasses } from "@/features/teaching";

export const metadata: Metadata = { title: "Lớp tôi dạy" };

export default function MyClassesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lớp tôi dạy</h1>
      <MyClasses />
    </div>
  );
}
