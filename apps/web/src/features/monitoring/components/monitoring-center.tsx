"use client";

import { ALERT_KIND_NAMES, ROLE_NAMES, USER_STATUS_NAMES, type BulkUserAction, type BulkUserActionResultDto, type UserDto } from "@pvh/shared";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { usePortalBase } from "@/shared/lib/use-portal-base";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import {
  bulkUserAction,
  getSecurity,
  listAlerts,
  listErrors,
  listFailedJobs,
  listSessions,
  logoutAll,
  resolveAlert,
  resolveError,
  retryJob,
  revokeSession,
  searchUsers,
  unblock,
} from "../api/monitoring-api";
import { EmptyState, Skeleton, Table, useConfirm } from "@/shared/ui";

// Bước 28: hai mục menu cùng dùng trang này. "Lỗi và hàng đợi" (nhóm Hệ thống) và "Bảo mật và đăng nhập" (nhóm Tài khoản).
export type MonitoringSection = "system" | "security";
const SECTION_SLUG: Record<MonitoringSection, string> = { system: "loi-he-thong", security: "giam-sat" };

const TABS = [
  { id: "canh-bao", label: "Cảnh báo", section: "system" },
  { id: "loi", label: "Nhật ký lỗi", section: "system" },
  { id: "hang-doi", label: "Hàng đợi", section: "system" },
  { id: "bao-mat", label: "Bảo mật đăng nhập", section: "security" },
  { id: "phien", label: "Phiên đăng nhập", section: "security" },
] as const satisfies readonly { id: string; label: string; section: MonitoringSection }[];
type TabId = (typeof TABS)[number]["id"];

const smallButton = "rounded-xl border border-border-strong px-2 py-1 text-sm hover:bg-primary-soft disabled:opacity-50";
const th = "py-1 pr-3 font-normal";

// Thao tác: chạy rồi tải lại; lỗi hiện ngay dưới nút.
function useAction(reload: () => void) {
  const ask = useConfirm();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !(await ask(confirmText))) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run };
}

// Trang giám sát của cổng /admin (bước 26). Thẻ đang mở nằm trên URL (?tab=…, ?user=…) để liên kết thẳng được.
// Liên kết cũ trỏ tới thẻ của mục kia (vd. /admin/giam-sat?tab=loi) được chuyển sang đúng trang, giữ tham số.
export function MonitoringCenter({ section }: { section: MonitoringSection }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const base = usePortalBase();
  const tabs = TABS.filter((t) => t.section === section);
  const requested = TABS.find((t) => t.id === params.get("tab"));
  const tab: TabId = requested?.section === section ? requested.id : tabs[0].id;
  const select = (id: TabId) => router.replace(`${pathname}?tab=${id}`, { scroll: false });

  useEffect(() => {
    if (requested && requested.section !== section) {
      router.replace(`${base}/${SECTION_SLUG[requested.section]}?${params.toString()}`);
    }
  }, [requested, section, base, params, router]);

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Mục giám sát" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => select(t.id)}
            className={`rounded-xl px-3 py-1.5 text-sm ${tab === t.id ? "bg-primary text-primary-foreground" : "border border-border-strong"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "canh-bao" && <AlertsTab />}
        {tab === "loi" && <ErrorsTab />}
        {tab === "hang-doi" && <JobsTab />}
        {tab === "bao-mat" && <SecurityTab />}
        {/* key: mở từ trang Người dùng với ?user= khác thì dựng lại thẻ với người đó. */}
        {tab === "phien" && <SessionsTab key={params.get("user") ?? ""} initialUserId={params.get("user")} />}
      </div>
    </div>
  );
}

function AlertsTab() {
  const [open, setOpen] = useState(true);
  const { data, error, reload } = useData(listAlerts, open);
  const action = useAction(reload);
  return (
    <section className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!open} onChange={(e) => setOpen(!e.target.checked)} /> Xem cả cảnh báo đã đóng
      </label>
      {(error || action.error) && <p className={errorClass}>{error ?? action.error}</p>}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <p className="text-sm text-muted">{open ? "Không có cảnh báo nào đang mở." : "Chưa có cảnh báo nào."}</p>
      ) : (
        <ul className="space-y-2">
          {data.map((a) => (
            <li key={a.id} className="space-y-1 rounded-2xl bg-surface border border-border p-3 text-sm">
              <p>
                <span className="font-medium">{ALERT_KIND_NAMES[a.kind]}</span> · {formatDateTime(a.openedAt)}
                {a.resolvedAt && <span className="text-muted"> · đã đóng {formatDateTime(a.resolvedAt)}</span>}
              </p>
              <p className="font-medium">{a.title}</p>
              {a.detail && <p className="break-words text-muted">{a.detail}</p>}
              {!a.resolvedAt && (
                <button type="button" className={smallButton} disabled={action.busy} onClick={() => action.run(() => resolveAlert(a.id))}>
                  Đánh dấu đã xử lý
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ErrorsTab() {
  const [resolved, setResolved] = useState(false);
  const { data, error, reload } = useData(listErrors, resolved);
  const action = useAction(reload);
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">
        Lỗi máy chủ (5xx) và job thất bại, gom theo nhóm. Chỉ lưu route/tên job, mã lỗi và thông điệp đã làm sạch (không có nội dung gửi lên, cookie hay token).
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} /> Xem nhóm đã xử lý
      </label>
      {(error || action.error) && <p className={errorClass}>{error ?? action.error}</p>}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <EmptyState>Không có lỗi nào.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr className="border-b border-border text-muted">
              <th className={th}>Nguồn</th>
              <th className={th}>Route / job</th>
              <th className={th}>Thông điệp</th>
              <th className={`${th} text-right`}>Số lần</th>
              <th className={th}>Lần cuối</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {data.map((e) => (
              <tr key={e.id} className="border-b border-border align-top">
                <td className="py-1 pr-3">{e.source === "HTTP" ? `HTTP ${e.statusCode ?? ""}` : "Job"}</td>
                <td className="py-1 pr-3 font-mono text-xs">{e.route}</td>
                <td className="min-w-48 break-words py-1 pr-3">{e.message}</td>
                <td className="py-1 pr-3 text-right">{e.count.toLocaleString("vi-VN")}</td>
                <td className="whitespace-nowrap py-1 pr-3">{formatDateTime(e.lastSeenAt)}</td>
                <td className="py-1">
                  {!e.resolvedAt && (
                    <button type="button" className={smallButton} disabled={action.busy} onClick={() => action.run(() => resolveError(e.id))}>
                      Đã xử lý
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}

function JobsTab() {
  const { data, error, reload } = useData(listFailedJobs, undefined);
  const action = useAction(reload);
  return (
    <section className="space-y-3">
      <p className="text-sm text-muted">Job thất bại hẳn (đã hết lượt thử) đang lưu trong từng hàng đợi. Chạy lại khi đã khắc phục nguyên nhân.</p>
      {(error || action.error) && <p className={errorClass}>{error ?? action.error}</p>}
      {!data ? (
        <Skeleton />
      ) : data.length === 0 ? (
        <EmptyState>Không có job thất bại nào.</EmptyState>
      ) : (
        <Table>
          <thead>
            <tr className="border-b border-border text-muted">
              <th className={th}>Hàng đợi</th>
              <th className={th}>Job</th>
              <th className={th}>Lý do</th>
              <th className={`${th} text-right`}>Lần thử</th>
              <th className={th}>Lúc</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {data.map((j) => (
              <tr key={`${j.queue}:${j.id}`} className="border-b border-border align-top">
                <td className="py-1 pr-3 font-mono text-xs">{j.queue}</td>
                <td className="py-1 pr-3 font-mono text-xs">{j.name}</td>
                <td className="min-w-48 break-words py-1 pr-3">{j.reason}</td>
                <td className="py-1 pr-3 text-right">{j.attemptsMade}</td>
                <td className="whitespace-nowrap py-1 pr-3">{j.failedAt ? formatDateTime(j.failedAt) : "–"}</td>
                <td className="py-1">
                  <button
                    type="button"
                    className={smallButton}
                    disabled={action.busy}
                    onClick={() => action.run(() => retryJob(j.queue, j.id), `Chạy lại job ${j.name} của hàng đợi ${j.queue}?`)}
                  >
                    Chạy lại
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </section>
  );
}

function SecurityTab() {
  const { data, error, reload } = useData(getSecurity, undefined);
  const action = useAction(reload);
  if (error && !data) return <p className={errorClass}>{error}</p>;
  if (!data) return <Skeleton />;
  return (
    <div className="space-y-6">
      {action.error && <p className={errorClass}>{action.error}</p>}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Đang bị chặn tạm thời</h2>
        {data.blocked.length === 0 ? (
          <EmptyState>Không có IP hay tài khoản nào đang bị chặn.</EmptyState>
        ) : (
          <ul className="space-y-2">
            {data.blocked.map((b) => (
              <li key={`${b.limit}:${b.id}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-2 text-sm">
                <span className="font-medium">{b.label}</span>
                <span className="break-all font-mono text-xs">{b.id}</span>
                <span className="text-muted">
                  {b.count} lần sai · còn {Math.ceil(b.retryAfterSec / 60)} phút
                </span>
                <button
                  type="button"
                  className={smallButton}
                  disabled={action.busy}
                  onClick={() => action.run(() => unblock(b), `Gỡ chặn ${b.id}?`)}
                >
                  Gỡ chặn
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Đăng nhập sai trong 24 giờ</h2>
        {data.failedLogins.length === 0 ? (
          <EmptyState>Không có lần đăng nhập sai nào.</EmptyState>
        ) : (
          <Table>
            <thead>
              <tr className="border-b border-border text-muted">
                <th className={th}>Email / mã đăng nhập</th>
                <th className={`${th} text-right`}>Số lần</th>
                <th className={th}>IP</th>
                <th className={th}>Lần cuối</th>
              </tr>
            </thead>
            <tbody>
              {data.failedLogins.map((f) => (
                <tr key={f.identifier} className="border-b border-border align-top">
                  <td className="break-all py-1 pr-3">{f.identifier}</td>
                  <td className="py-1 pr-3 text-right">{f.count}</td>
                  <td className="break-all py-1 pr-3 font-mono text-xs">{f.ips.join(", ")}</td>
                  <td className="whitespace-nowrap py-1 pr-3">{formatDateTime(f.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Sự kiện bảo mật gần đây</h2>
        {data.alerts.length === 0 ? (
          <EmptyState>Chưa có sự kiện nào.</EmptyState>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="break-words">
                <span className="text-muted">{formatDateTime(a.openedAt)}</span> · <span className="font-medium">{ALERT_KIND_NAMES[a.kind]}:</span> {a.title}
                {a.detail && <span className="text-muted"> – {a.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

const searchOrNull = (q: string) => (q.trim().length >= 2 ? searchUsers(q.trim()) : Promise.resolve(null));
const sessionsOrNull = (userId: string) => (userId ? listSessions(userId) : Promise.resolve(null));

function SessionsTab({ initialUserId }: { initialUserId: string | null }) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [userId, setUserId] = useState(initialUserId ?? "");
  const [picked, setPicked] = useState<string[]>([]);
  const users = useData(searchOrNull, submitted);
  const sessions = useData(sessionsOrNull, userId);
  const action = useAction(() => {
    sessions.reload();
    users.reload();
  });

  const selectedUser = users.data?.items.find((u) => u.id === userId);

  return (
    <div className="space-y-6">
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          setSubmitted(query);
        }}
      >
        <label className="space-y-1 text-sm">
          <span>Tìm người dùng (tên, email, mã)</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className={`${inputClass} w-64 max-w-full`} />
        </label>
        <button type="submit" className={smallButton}>
          Tìm
        </button>
      </form>
      {(users.error || sessions.error || action.error) && <p className={errorClass}>{users.error ?? sessions.error ?? action.error}</p>}

      {users.data && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Kết quả ({users.data.total})</h2>
          <ul className="space-y-1">
            {users.data.items.map((u) => (
              <UserRow
                key={u.id}
                user={u}
                checked={picked.includes(u.id)}
                selected={u.id === userId}
                onCheck={(on) => setPicked((p) => (on ? [...p, u.id] : p.filter((id) => id !== u.id)))}
                onSelect={() => setUserId(u.id)}
              />
            ))}
          </ul>
          {picked.length > 0 && <BulkForm userIds={picked} onDone={() => (setPicked([]), users.reload(), sessions.reload())} />}
        </section>
      )}

      {userId && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Phiên đang hoạt động{selectedUser ? ` của ${selectedUser.fullName}` : ""}</h2>
          <p className="text-sm text-muted">
            Buộc đăng xuất thu hồi mọi phiên: người dùng phải đăng nhập lại sau tối đa 15 phút. Muốn chặn ngay, hãy khoá tài khoản ở trang Người dùng.
          </p>
          {!sessions.data ? (
            <Skeleton />
          ) : sessions.data.length === 0 ? (
            <EmptyState>Không có phiên nào đang hoạt động.</EmptyState>
          ) : (
            <>
              <ul className="space-y-1 text-sm">
                {sessions.data.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border p-2">
                    <span>{s.userAgent ?? "Thiết bị không rõ"}</span>
                    <span className="font-mono text-xs text-muted">{s.ip ?? "IP không rõ"}</span>
                    <span className="text-muted">từ {formatDateTime(s.createdAt)}</span>
                    <button
                      type="button"
                      className={smallButton}
                      disabled={action.busy}
                      onClick={() => action.run(() => revokeSession(userId, s.id), "Thu hồi phiên này?")}
                    >
                      Thu hồi
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={smallButton}
                disabled={action.busy}
                onClick={() => action.run(() => logoutAll(userId), "Buộc đăng xuất mọi phiên của người này?")}
              >
                Buộc đăng xuất mọi phiên
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function UserRow({
  user,
  checked,
  selected,
  onCheck,
  onSelect,
}: {
  user: UserDto;
  checked: boolean;
  selected: boolean;
  onCheck: (on: boolean) => void;
  onSelect: () => void;
}) {
  return (
    <li className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl p-2 text-sm ${selected ? "bg-surface-muted " : ""}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label={`Chọn ${user.fullName}`} />
      <span className="font-medium">{user.fullName}</span>
      <span className="text-muted">{user.email ?? user.code}</span>
      <span className="text-muted">{user.roles.map((r) => ROLE_NAMES[r]).join(", ")}</span>
      <span className={user.status === "LOCKED" ? "text-danger" : "text-muted"}>{USER_STATUS_NAMES[user.status]}</span>
      <button type="button" className="underline" onClick={onSelect}>
        Xem phiên
      </button>
    </li>
  );
}

// Khoá / buộc đăng xuất hàng loạt: bắt buộc nhập lại mật khẩu của chính mình.
function BulkForm({ userIds, onDone }: { userIds: string[]; onDone: () => void }) {
  const [kind, setKind] = useState<BulkUserAction>("logout");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUserActionResultDto | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await bulkUserAction({ action: kind, userIds, password }));
      setPassword("");
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-2xl bg-surface border border-border p-3">
      <p className="text-sm font-medium">Thao tác với {userIds.length} người đã chọn</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-sm">
          <span>Thao tác</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as BulkUserAction)} className={`${inputClass} w-auto`}>
            <option value="logout">Buộc đăng xuất</option>
            <option value="lock">Khoá tài khoản</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          <span>Mật khẩu của bạn (xác nhận)</span>
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} w-56 max-w-full`} />
        </label>
        <button type="submit" disabled={busy || !password} className="rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">
          {busy ? "Đang thực hiện…" : "Thực hiện"}
        </button>
      </div>
      {error && <p className={errorClass}>{error}</p>}
      {result && (
        <div className="text-sm">
          <p>Đã thực hiện cho {result.done} người.</p>
          {result.skipped.length > 0 && (
            <ul className="list-disc pl-5 text-muted">
              {result.skipped.map((s) => (
                <li key={s.userId}>
                  #{s.userId}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
