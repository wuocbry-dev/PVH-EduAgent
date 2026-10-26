"use client";

import { useEffect, useState } from "react";

export const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

// Tải dữ liệu bằng hàm `load(arg)` (hàm module ổn định); gọi reload() sau mỗi thay đổi để tải lại.
export function useData<A, T>(load: (arg: A) => Promise<T>, arg: A) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let current = true;
    load(arg)
      .then((value) => {
        if (!current) return;
        setData(value);
        setError(null);
      })
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [load, arg, version]);

  return { data, error, setError, reload: () => setVersion((v) => v + 1) };
}
