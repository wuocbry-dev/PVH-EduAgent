"use client";

import type { CategoryDto } from "@pvh/shared";
import { useEffect, useState, type FormEvent } from "react";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { createCategory, deleteCategory, getCategories, updateCategory } from "../api/categories-api";
import { flattenCategories, indent } from "../lib/tree";
import { CategorySelect } from "./category-select";
import { Skeleton, useConfirm } from "@/shared/ui";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// F13 – quản lý chuyên mục dạng cây (cha–con, thứ tự hiển thị).
export function CategoryManager() {
  const ask = useConfirm();
  const [categories, setCategories] = useState<CategoryDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Chuyên mục đang sửa (null = đang thêm mới).
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [parentId, setParentId] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    getCategories()
      .then((data) => current && setCategories(data))
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [version]);

  const reload = () => setVersion((v) => v + 1);

  function startEdit(category: CategoryDto | null) {
    setEditing(category);
    setParentId(category?.parentId ?? "");
    setError(null);
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = {
      name: String(form.get("name")),
      parentId: parentId || null,
      sortOrder: Number(form.get("sortOrder")) || 0,
    };
    setError(null);
    try {
      if (editing) await updateCategory(editing.id, body);
      else await createCategory(body);
      formEl.reset();
      startEdit(null);
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  async function remove(category: CategoryDto) {
    if (!(await ask(`Xóa chuyên mục "${category.name}"? Bài viết thuộc chuyên mục sẽ thành chưa phân loại.`))) return;
    setError(null);
    try {
      await deleteCategory(category.id);
      if (editing?.id === category.id) startEdit(null);
      reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const rows = flattenCategories(categories ?? []);

  return (
    <div className="space-y-6">
      <form
        // key để form nạp lại giá trị mặc định khi đổi giữa thêm mới và sửa.
        key={editing?.id ?? "new"}
        onSubmit={onSubmit}
        className="flex max-w-2xl flex-wrap items-end gap-3 rounded-xl border border-border p-4"
      >
        <h2 className="w-full text-lg font-semibold">{editing ? `Sửa: ${editing.name}` : "Thêm chuyên mục"}</h2>
        <label className="space-y-1 text-sm">
          <span>Tên</span>
          <input name="name" defaultValue={editing?.name} required className={`${inputClass} w-56`} />
        </label>
        <label className="space-y-1 text-sm">
          <span>Chuyên mục cha</span>
          <CategorySelect key={version} value={parentId} onChange={setParentId} emptyLabel="— Gốc —" />
        </label>
        <label className="space-y-1 text-sm">
          <span>Thứ tự</span>
          <input
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={editing?.sortOrder ?? 0}
            className={`${inputClass} w-24`}
          />
        </label>
        <button type="submit" className={`${buttonClass} w-auto`}>
          {editing ? "Lưu" : "Thêm"}
        </button>
        {editing && (
          <button type="button" onClick={() => startEdit(null)} className="rounded-xl border border-border-strong px-4 py-2">
            Hủy
          </button>
        )}
      </form>

      {error && <p className={errorClass}>{error}</p>}
      {categories === null && !error && <Skeleton />}

      {categories && (
        <ul className="max-w-2xl divide-y divide-border">
          {rows.map(({ category, depth }) => (
            <li key={category.id} className="flex items-center justify-between gap-4 py-2">
              <span>
                {indent(depth)}
                {category.name}
                <span className="ml-2 text-xs text-muted">/{category.slug} · thứ tự {category.sortOrder}</span>
              </span>
              <span className="flex gap-3 text-sm">
                <button type="button" className="underline" onClick={() => startEdit(category)}>
                  Sửa
                </button>
                <button type="button" className="underline" onClick={() => remove(category)}>
                  Xóa
                </button>
              </span>
            </li>
          ))}
          {rows.length === 0 && <li className="py-2 text-sm text-muted">Chưa có chuyên mục nào.</li>}
        </ul>
      )}
    </div>
  );
}
