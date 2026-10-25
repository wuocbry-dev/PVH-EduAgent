import { getAdmission } from "../api/get-admission";

const score = (value: number | null) => (value === null ? "—" : value.toLocaleString("vi-VN", { minimumFractionDigits: 2 }));

// F05 – chỉ tiêu và điểm chuẩn lớp 10 qua các năm. Đọc dữ liệu có cache nên đặt trong <Suspense>.
export async function AdmissionTable() {
  const stats = await getAdmission();

  if (stats === null) {
    return <p className="text-sm opacity-70">Không tải được dữ liệu tuyển sinh lúc này, vui lòng thử lại sau.</p>;
  }
  if (stats.length === 0) return <p className="text-sm opacity-70">Thông tin tuyển sinh đang được cập nhật.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-sm">
        <caption className="sr-only">Chỉ tiêu và điểm chuẩn lớp 10 theo năm học</caption>
        <thead className="border-b border-black/20 dark:border-white/20">
          <tr>
            <th scope="col" className="py-2 pr-4">Năm học</th>
            <th scope="col" className="py-2 pr-4">Chỉ tiêu</th>
            <th scope="col" className="py-2 pr-4">Điểm chuẩn NV1</th>
            <th scope="col" className="py-2 pr-4">NV2</th>
            <th scope="col" className="py-2 pr-4">NV3</th>
            <th scope="col" className="py-2">Ghi chú</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-black/10 dark:divide-white/15">
          {stats.map((s) => (
            <tr key={s.schoolYear}>
              <th scope="row" className="py-2 pr-4 font-semibold">{s.schoolYear}</th>
              <td className="py-2 pr-4">{s.quota.toLocaleString("vi-VN")}</td>
              <td className="py-2 pr-4">{score(s.benchmarkNv1)}</td>
              <td className="py-2 pr-4">{score(s.benchmarkNv2)}</td>
              <td className="py-2 pr-4">{score(s.benchmarkNv3)}</td>
              <td className="py-2 opacity-80">{s.note ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
