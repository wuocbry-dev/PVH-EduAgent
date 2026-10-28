import { getAdmission } from "../api/get-admission";
import { Table } from "@/shared/ui";

const score = (value: number | null) => (value === null ? "—" : value.toLocaleString("vi-VN", { minimumFractionDigits: 2 }));

// F05 – chỉ tiêu và điểm chuẩn lớp 10 qua các năm. Đọc dữ liệu có cache nên đặt trong <Suspense>.
export async function AdmissionTable() {
  const stats = await getAdmission();

  if (stats === null) {
    return <p className="text-sm text-muted">Không tải được dữ liệu tuyển sinh lúc này, vui lòng thử lại sau.</p>;
  }
  if (stats.length === 0) return <p className="text-sm text-muted">Thông tin tuyển sinh đang được cập nhật.</p>;

  return (
    <Table className="min-w-[32rem]">
      <caption className="sr-only">Chỉ tiêu và điểm chuẩn lớp 10 theo năm học</caption>
      <thead className="border-b border-border-strong">
        <tr>
          <th scope="col" className="py-2 pr-4">Năm học</th>
          <th scope="col" className="py-2 pr-4">Chỉ tiêu</th>
          <th scope="col" className="py-2 pr-4">Điểm chuẩn NV1</th>
          <th scope="col" className="py-2 pr-4">NV2</th>
          <th scope="col" className="py-2 pr-4">NV3</th>
          <th scope="col" className="py-2">Ghi chú</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {stats.map((s) => (
          <tr key={s.schoolYear}>
            <th scope="row" className="py-2 pr-4 font-semibold">{s.schoolYear}</th>
            <td className="py-2 pr-4">{s.quota.toLocaleString("vi-VN")}</td>
            <td className="py-2 pr-4">{score(s.benchmarkNv1)}</td>
            <td className="py-2 pr-4">{score(s.benchmarkNv2)}</td>
            <td className="py-2 pr-4">{score(s.benchmarkNv3)}</td>
            <td className="py-2 text-muted">{s.note ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
