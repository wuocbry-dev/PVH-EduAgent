import Link from "next/link";

const NAV = [
  { href: "/admin", label: "Tổng quan" },
  { href: "/admin/tro-ly-ai", label: "Trợ lý AI" },
] as const;

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <aside className="border-b border-black/10 p-4 md:w-56 md:border-r md:border-b-0 dark:border-white/15">
        <Link href="/" className="font-semibold">
          CMS · PVH
        </Link>
        <nav className="mt-4 flex gap-4 md:flex-col md:gap-2">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm">
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
