"use client";

import { useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getMyTeaching } from "../api/teaching-api";
import { Skeleton, Table } from "@/shared/ui";

// Cổng giáo viên: "Lớp tôi dạy" (lớp, môn, số tiết/tuần, sĩ số) — chỉ phân công của chính mình.
export function MyClasses() {
  const { data, error } = useData(getMyTeaching, undefined);

  if (error) return <p className={errorClass}>{error}</p>;
  if (!data) return <Skeleton />;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        Năm học {data.schoolYearName ?? "—"}: đang dạy <strong>{data.totalPeriods}</strong> tiết/tuần, định mức {data.weeklyQuota} tiết/tuần.
      </p>
      {data.items.length === 0 ? (
        <p className="text-sm text-muted">Bạn chưa được phân công lớp nào. Liên hệ Ban giám hiệu nếu cần.</p>
      ) : (
        <Table>
          <thead className="border-b border-border">
            <tr>
              <th className="py-2 pr-4">Lớp</th>
              <th className="py-2 pr-4">Môn</th>
              <th className="py-2 pr-4">Phạm vi</th>
              <th className="py-2 pr-4">Tiết/tuần</th>
              <th className="py-2">Sĩ số</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
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
        </Table>
      )}
    </div>
  );
}
