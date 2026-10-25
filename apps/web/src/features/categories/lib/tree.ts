import type { CategoryDto } from "@pvh/shared";

export interface CategoryRow {
  category: CategoryDto;
  depth: number;
}

// Duyệt cây theo thứ tự hiển thị (cha rồi tới con, theo sort_order). Chuyên mục mất cha coi như gốc.
export function flattenCategories(categories: CategoryDto[]): CategoryRow[] {
  const ids = new Set(categories.map((c) => c.id));
  const children = new Map<string | null, CategoryDto[]>();
  for (const c of categories) {
    const key = c.parentId && ids.has(c.parentId) ? c.parentId : null;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const rows: CategoryRow[] = [];
  const visit = (parentId: string | null, depth: number) => {
    for (const category of children.get(parentId) ?? []) {
      rows.push({ category, depth });
      visit(category.id, depth + 1);
    }
  };
  visit(null, 0);
  return rows;
}

export const indent = (depth: number) => "— ".repeat(depth);
