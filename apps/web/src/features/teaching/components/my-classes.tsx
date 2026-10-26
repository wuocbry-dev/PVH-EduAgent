"use client";

import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getMyTeaching } from "../api/teaching-api";

// Cổng giáo viên: "Lớp tôi dạy" (lớp, môn, số tiết/tuần, sĩ số) — chỉ phân công của chính mình.
export function MyClasses() {
  const { data, error } = useData(getMyTeaching, undefined);

  if (error) return <p className={errorClass}>{error}</p>;
  if (!data) return <p className="text-sm opacity-60">Đang tải…</p>;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Năm học {data.schoolYearName ?? "—"}: đang dạy <strong>{data.totalPeriods}</strong> tiết/tuần, định mức {data.weeklyQuota} tiết/tuần.
      </p>
      {data.items.length === 0 ? (
        <p className="text-sm opacity-70">Bạn chưa được phân công lớp nào. Liên hệ Ban giám hiệu nếu cần.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/15">
              <tr>
                <th className="py-2 pr-4">Lớp</th>
                <th className="py-2 pr-4">Môn</th>
                <th className="py-2 pr-4">Phạm vi</th>
                <th className="py-2 pr-4">Tiết/tuần</th>
                <th className="py-2">Sĩ số</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/15">
              {data.items.map((i, idx) => (
                <tr key={idx}>
                  <td className="py-2 pr-4 font-medium">{i.className}</td>
                  <td className="py-2 pr-4">{i.subjectName}</td>
                  <td className="py-2 pr-4">{i.semesterName ?? "Cả năm"}</td>
                  <td className="py-2 pr-4">{i.periodsPerWeek}</td>
                  <td className="py-2">{i.studentCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
