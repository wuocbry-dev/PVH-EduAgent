"use client";

import type { ScoreSheetDto } from "@pvh/shared";
import { useState } from "react";
import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getSheet } from "../api/scores-api";
import { ScoreGrid } from "./score-grid";

const loadSheet = (key: string) => {
  const [assessmentId, classId] = key.split(":") as [string, string];
  return getSheet({ assessmentId, classId });
};

// Tải bảng điểm một lớp của đợt và giữ bản mới nhất sau mỗi lần lưu/công bố. Đổi lớp/đợt thì dựng lại (key ở nơi dùng).
export function SheetPanel({
  assessmentId,
  classId,
  onChanged,
  onDirtyChange,
}: {
  assessmentId: string;
  classId: string;
  onChanged?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const loaded = useData(loadSheet, `${assessmentId}:${classId}`);
  const [local, setLocal] = useState<ScoreSheetDto | null>(null);
  const sheet = local ?? loaded.data;

  if (loaded.error) return <p className={errorClass}>{loaded.error}</p>;
  if (!sheet) return <p className="text-sm opacity-60">Đang tải bảng điểm…</p>;
  return (
    <ScoreGrid
      sheet={sheet}
      onDirtyChange={onDirtyChange}
      onSheet={(s) => {
        setLocal(s);
        onChanged?.();
      }}
    />
  );
}
