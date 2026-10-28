"use client";

import { useState } from "react";
import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getFrame, listClasses, listRooms, listSemesters, listTeachers, listVersions } from "../api/timetable-api";
import type { EditorContext } from "./context";
import { FrameTab } from "./frame-tab";
import { GridTab } from "./grid-tab";
import { VersionsTab } from "./versions-tab";
import { ViewsTab } from "./views-tab";
import { Skeleton } from "@/shared/ui";

const TABS = [
  { id: "grid", label: "Xếp lịch theo lớp" },
  { id: "views", label: "Xem theo giáo viên / phòng" },
  { id: "versions", label: "Phiên bản và công bố" },
  { id: "frame", label: "Khung tiết và tiết cố định" },
] as const;

const loadAll = async () => {
  const [frame, versions, semesters, classes, rooms, teachers] = await Promise.all([
    getFrame(),
    listVersions(),
    listSemesters(),
    listClasses(),
    listRooms(),
    listTeachers(),
  ]);
  return { frame, versions, semesters, classes, rooms, teachers };
};

// Trang thời khoá biểu của Ban giám hiệu (xếp, công bố) và ADMIN (chỉ xem).
export function TimetableManager({ readOnly = false }: { readOnly?: boolean }) {
  const data = useData(loadAll, undefined);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("grid");
  const [versionId, setVersionId] = useState("");

  if (data.error) return <p className={errorClass}>{data.error}</p>;
  if (!data.data) return <Skeleton />;
  const d = data.data;
  // Mặc định: bản nháp mới nhất, không có thì bản công bố mới nhất.
  const version = d.versions.find((v) => v.id === versionId) ?? d.versions.find((v) => v.status === "DRAFT") ?? d.versions[0] ?? null;
  const ctx: EditorContext = { ...d, version, selectVersion: setVersionId, readOnly, reload: data.reload };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex items-center gap-2 text-sm">
          <span>Phiên bản đang xem</span>
          <select value={version?.id ?? ""} onChange={(e) => setVersionId(e.target.value)} className="rounded-xl border border-border-strong bg-transparent px-2 py-1">
            {d.versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.semesterName} · {v.status === "DRAFT" ? "nháp" : v.status === "PUBLISHED" ? "đã công bố" : "lưu trữ"}
              </option>
            ))}
            {d.versions.length === 0 && <option value="">Chưa có</option>}
          </select>
        </label>
      </div>
      <div role="tablist" aria-label="Thời khoá biểu" className="flex flex-wrap gap-2 print:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
            className={`rounded-xl border px-3 py-1 text-sm ${t.id === tab ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "grid" && <GridTab key={version?.id} ctx={ctx} />}
      {tab === "views" && <ViewsTab ctx={ctx} />}
      {tab === "versions" && <VersionsTab ctx={ctx} />}
      {tab === "frame" && <FrameTab ctx={ctx} />}
    </div>
  );
}
