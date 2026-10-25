import type { CategoryDto, SaveCategoryRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function getCategories() {
  return api<CategoryDto[]>("/categories");
}

export function createCategory(body: SaveCategoryRequest) {
  return api<CategoryDto>("/categories", { method: "POST", body: JSON.stringify(body) });
}

export function updateCategory(id: string, body: Partial<SaveCategoryRequest>) {
  return api<CategoryDto>(`/categories/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

export function deleteCategory(id: string) {
  return api<void>(`/categories/${id}`, { method: "DELETE" });
}
