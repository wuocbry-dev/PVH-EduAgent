import type { Metadata } from "next";
import { CategoryManager } from "@/features/categories";

export const metadata: Metadata = { title: "Chuyên mục" };

export default function CategoriesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Chuyên mục</h1>
      <CategoryManager />
    </div>
  );
}
