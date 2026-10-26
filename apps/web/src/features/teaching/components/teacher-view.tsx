"use client";

import { useState } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { setTeacherQuota } from "../api/teaching-api";
import type { TeachingContext } from "./context";

// Phân công theo giáo viên: các lớp–môn đang dạy, tổng tiết so với định mức (có thể đặt định mức riêng).
export function TeacherView({ ctx }: { ctx: TeachingContext }) {
  const [error, setError] = useState<string | null>(null);

  async function saveQuota(userId: string, value: string) {
    setError(null);
    try {
      await setTeacherQuota(userId, value.trim() === "" ? null : Number(value));
      ctx.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section className="space-y-3" aria-label="Phân công theo giáo viên">
      {error && <p className={errorClass}>{error}</p>}
      <p className="text-sm opacity-70">
        Định mức mặc định {ctx.summary.defaultQuota} tiết/tuần (đổi ở Cấu hình hệ thống). Ô «Định mức riêng» dùng cho giáo viên giảm tiết (chủ nhiệm, tổ trưởng…).
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-black/10 dark:border-white/15">
            <tr>
              <th className="py-2 pr-3">Giáo viên</th>
              <th className="py-2 pr-3">Tổ</th>
              <th className="py-2 pr-3">Tiết / định mức</th>
              <th className="py-2 pr-3">Lớp – môn đang dạy</th>
              <th className="py-2">Định mức riêng</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/10 dark:divide-white/15">
            {ctx.summary.teachers.map((t) => (
              <tr key={t.teacherId} className={t.delta > 0 ? "bg-red-500/15" : t.delta < 0 ? "bg-yellow-500/15" : ""}>
                <td className="py-2 pr-3 align-top">
                  <span className="font-medium">{t.teacherName}</span> <span className="font-mono text-xs opacity-70">{t.teacherCode}</span>
                </td>
                <td className="py-2 pr-3 align-top">{t.departmentName ?? ""}</td>
                <td className="py-2 pr-3 align-top">
                  <strong>{t.periods}</strong>/{t.quota}{" "}
                  <span className="text-xs">{t.delta > 0 ? `(vượt ${t.delta})` : t.delta < 0 ? `(thiếu ${-t.delta})` : "(đủ)"}</span>
                </td>
                <td className="py-2 pr-3 align-top">
                  {t.assignments.length === 0 ? (
                    <span className="opacity-60">Chưa có</span>
                  ) : (
                    t.assignments.map((a) => `${a.className} ${a.subjectName} (${a.periodsPerWeek})`).join("; ")
                  )}
                </td>
                <td className="py-2 align-top">
                  <input
                    key={`${t.teacherId}:${t.quotaOverridden ? t.quota : ""}`}
                    type="number"
                    min={0}
                    max={40}
                    disabled={ctx.readOnly}
                    placeholder="mặc định"
                    defaultValue={t.quotaOverridden ? t.quota : ""}
                    aria-label={`Định mức riêng của ${t.teacherName}`}
                    onBlur={(e) => {
                      const current = t.quotaOverridden ? String(t.quota) : "";
                      if (e.target.value !== current) void saveQuota(t.teacherId, e.target.value);
                    }}
                    className={`${inputClass} w-24`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
