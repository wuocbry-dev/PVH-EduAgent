"use client";

import type { AccountSlipDto } from "@pvh/shared";

const fmt = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Phiếu tài khoản để in: mỗi lớp một trang, mỗi học sinh một phiếu. Mã kích hoạt chỉ có trong dữ liệu vừa phát hành
// (hệ thống chỉ lưu bản băm), nên phiếu không dựng lại được sau khi rời trang.
export function SlipSheet({ slips }: { slips: AccountSlipDto[] }) {
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const groups = new Map<string, AccountSlipDto[]>();
  for (const slip of slips) {
    const key = slip.className ?? "Giáo viên";
    groups.set(key, [...(groups.get(key) ?? []), slip]);
  }

  return (
    <div className="space-y-6">
      {[...groups].map(([className, items]) => (
        <section key={className} className="break-after-page space-y-3 print:space-y-2">
          <h3 className="font-semibold print:text-lg">
            {className} · {items.length} phiếu
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2 print:gap-2">
            {items.map((s) => (
              <article
                key={s.userId}
                className="break-inside-avoid space-y-1 rounded-xl border border-dashed border-border-strong p-3 text-sm"
              >
                <p className="text-xs uppercase text-muted">Trường THPT Phan Văn Hớn · Phiếu tài khoản</p>
                <p className="font-semibold">{s.fullName}</p>
                <p>
                  Lớp/nhóm: <span className="font-medium">{s.className ?? "Giáo viên"}</span>
                </p>
                <p>
                  Mã đăng nhập: <span className="font-mono font-semibold">{s.loginId}</span>
                </p>
                <p>
                  Mã kích hoạt: <span className="font-mono text-base font-bold tracking-wider">{s.activationCode}</span>
                </p>
                <p className="text-xs text-muted">
                  Dùng một lần, hết hạn {fmt(s.expiresAt)}. Vào <span className="font-mono">{origin}/kich-hoat</span>, nhập mã đăng nhập, mã
                  kích hoạt và đặt mật khẩu mới.
                </p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
