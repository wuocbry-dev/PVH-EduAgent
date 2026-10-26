import { PORTAL_INFO, portalsFor, type Portal } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";

// Nút đổi cổng cho người có nhiều vai trò; một cổng duy nhất thì không hiện gì.
export async function PortalSwitcher({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  const others = portalsFor(user.roles).filter((p) => p !== portal);
  if (others.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="opacity-60">Đổi cổng:</span>
      {others.map((p) => (
        <Link key={p} href={PORTAL_INFO[p].path} className="rounded border border-black/20 px-2 py-0.5 dark:border-white/20">
          {PORTAL_INFO[p].name}
        </Link>
      ))}
    </div>
  );
}
