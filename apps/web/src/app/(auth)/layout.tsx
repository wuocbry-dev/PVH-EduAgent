import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm space-y-6">
        <Link href="/" className="block text-center font-semibold">
          THPT Phan Văn Hớn
        </Link>
        <div className="rounded-lg border border-black/10 p-6 dark:border-white/15">{children}</div>
      </div>
    </main>
  );
}
