"use client";

import { errorClass } from "@/shared/ui/form-styles";
import { useData } from "@/shared/lib/use-data";
import { getMyScores } from "../api/scores-api";
import { StudentReportView } from "./score-views";
import { Skeleton } from "@/shared/ui";

// Cổng học sinh: chỉ điểm của chính em, chỉ điểm giáo viên đã công bố; không có điểm bạn khác hay xếp hạng.
export function StudentScores() {
  const report = useData(getMyScores, undefined);
  if (report.error) return <p className={errorClass}>{report.error}</p>;
  if (!report.data) return <Skeleton />;
  return <StudentReportView report={report.data} />;
}
