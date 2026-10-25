"use client";

import type { CategoryDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { inputClass } from "@/shared/ui/form-styles";
import { getCategories } from "../api/categories-api";
import { flattenCategories, indent } from "../lib/tree";

interface Props {
  value: string;
  onChange: (id: string) => void;
  emptyLabel: string;
  disabled?: boolean;
}

// Ô chọn chuyên mục theo cây; value rỗng = chưa chọn.
export function CategorySelect({ value, onChange, emptyLabel, disabled }: Props) {
  const [categories, setCategories] = useState<CategoryDto[]>([]);

  useEffect(() => {
    let current = true;
    getCategories()
      .then((data) => current && setCategories(data))
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputClass} w-auto`}
    >
      <option value="">{emptyLabel}</option>
      {flattenCategories(categories).map(({ category, depth }) => (
        <option key={category.id} value={category.id}>
          {indent(depth)}
          {category.name}
        </option>
      ))}
    </select>
  );
}
