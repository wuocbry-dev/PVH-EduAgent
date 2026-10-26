import { getOverview } from "../api/get-overview";

// Số liệu toàn trường cho Ban giám hiệu. Đọc phiên đăng nhập nên phải đặt trong <Suspense>.
export async function SchoolOverview() {
  const o = await getOverview();
  const items = [
    { label: "Lớp", value: o.classes },
    { label: "Học sinh", value: o.students },
    { label: "Giáo viên", value: o.teachers },
  ];

  return (
    <section aria-label="Toàn trường" className="space-y-2">
      <h2 className="text-lg font-semibold">Toàn trường{o.schoolYearName ? ` · năm học ${o.schoolYearName}` : ""}</h2>
      <ul className="grid gap-3 sm:grid-cols-3">
        {items.map((i) => (
          <li key={i.label} className="rounded-lg border border-black/10 p-4 dark:border-white/15">
            <p className="text-sm opacity-70">{i.label}</p>
            <p className="text-3xl font-bold">{i.value.toLocaleString("vi-VN")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
