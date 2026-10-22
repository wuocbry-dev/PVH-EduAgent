import Link from "next/link";

export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <header className="border-b border-black/10 dark:border-white/15">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-4">
          <Link href="/" className="font-semibold">
            THPT Phan Văn Hớn
          </Link>
          <Link href="/tin-tuc" className="text-sm">
            Tin tức
          </Link>
          <Link href="/admin" className="ml-auto text-sm opacity-70">
            Quản trị
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
