import { PORTAL_INFO, portalsFor, type Portal } from "@pvh/shared";
import Link from "next/link";
import { getCurrentUser } from "../api/get-current-user";
import { PortalDot } from "./portal-dot";

// Nút đổi cổng cho người có nhiều vai trò; một cổng duy nhất thì không hiện gì.
export async function PortalSwitcher({ portal }: { portal: Portal }) {
  const user = await getCurrentUser();
  const others = portalsFor(user.roles).filter((p) => p !== portal);
  if (others.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="text-muted">Đổi cổng:</span>
      {others.map((p) => (
        <Link
          key={p}
          href={PORTAL_INFO[p].path}
          className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-0.5 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none"
        >
          <PortalDot portal={p} />
          {PORTAL_INFO[p].name}
        </Link>
      ))}
    </div>
  );
}
