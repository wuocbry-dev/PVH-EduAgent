"use client";

import { useState } from "react";
import { DepartmentSection, RoomSection, SubjectSection } from "./catalog-sections";
import { ClassSection } from "./class-section";
import { SchoolYearSection } from "./school-year-section";

const TABS = [
  { id: "year", label: "Năm học và học kỳ", Section: SchoolYearSection },
  { id: "class", label: "Lớp học", Section: ClassSection },
  { id: "subject", label: "Môn học", Section: SubjectSection },
  { id: "department", label: "Tổ chuyên môn", Section: DepartmentSection },
  { id: "room", label: "Phòng bộ môn", Section: RoomSection },
] as const;

export function AcademicManager() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("class");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Dữ liệu học vụ" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === tab}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1 text-sm ${
              t.id === tab ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <active.Section />
    </div>
  );
}
