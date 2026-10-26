// Chỗ trống cho chức năng của các bước sau (thời khoá biểu, điểm, thông báo…).
export function ComingSoon({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((label) => (
        <li key={label} className="rounded-lg border border-dashed border-black/30 p-4 dark:border-white/30">
          <p className="font-medium">{label}</p>
          <p className="text-sm opacity-60">Sắp có</p>
        </li>
      ))}
    </ul>
  );
}
