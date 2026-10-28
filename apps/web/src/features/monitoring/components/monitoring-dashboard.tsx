"use client";

import { ALERT_KIND_NAMES, MONITOR_SERVICE_NAMES, type MonitoringOverviewDto } from "@pvh/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { usePortalBase } from "@/shared/lib/use-portal-base";
import { errorClass } from "@/shared/ui/form-styles";
import { checkNow, getOverview } from "../api/monitoring-api";
import { HourBars, StatusBadge } from "./charts";

const REFRESH_MS = 30_000;

export function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function formatUptime(seconds: number) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return d > 0 ? `${d} ngày ${h} giờ` : h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
}

function Tile({ label, value, note, alert, href }: { label: string; value: string; note?: string; alert?: boolean; href?: string }) {
  const body = (
    <>
      <p className="text-sm opacity-70">{label}</p>
      <p className={`text-2xl font-bold ${alert ? "text-red-700 dark:text-red-400" : ""}`}>
        {alert && <span aria-hidden>⚠ </span>}
        {value}
      </p>
      {note && <p className="text-xs opacity-70">{note}</p>}
    </>
  );
  const cls = "block h-full rounded-lg border border-black/10 p-3 dark:border-white/15";
  return href ? (
    <Link href={href} className={`${cls} hover:bg-black/5 dark:hover:bg-white/10`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

// Trang Tổng quan của cổng /admin (bước 26): trạng thái dịch vụ, lỗi, hàng đợi, dung lượng kho, bảo mật. Tự làm mới 30 giây.
export function MonitoringDashboard() {
  const base = usePortalBase();
  const { data, error, reload } = useData(getOverview, undefined);
  const [checking, setChecking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  async function runCheck() {
    setChecking(true);
    setActionError(null);
    try {
      await checkNow();
      reload();
    } catch (err) {
      setActionError(errorText(err));
    } finally {
      setChecking(false);
    }
  }

  if (error && !data) return <p className={errorClass}>{error}</p>;
  if (!data) return <p className="text-sm opacity-60">Đang tải…</p>;
  return <Overview data={data} base={base} checking={checking} onCheck={runCheck} actionError={actionError ?? error} />;
}

function Overview({
  data,
  base,
  checking,
  onCheck,
  actionError,
}: {
  data: MonitoringOverviewDto;
  base: string;
  checking: boolean;
  onCheck: () => void;
  actionError: string | null;
}) {
  const errors24h = data.errorsByHour.reduce((sum, h) => sum + h.count, 0);
  const failedJobs = data.queue.queues.reduce((sum, q) => sum + q.failed, 0);
  const down = data.services.filter((s) => s.status === "DOWN");
  const latencies = data.latency24h.filter((l) => l.hours.some((h) => h.avgMs !== null || h.down > 0));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onCheck}
          disabled={checking}
          className="rounded bg-foreground px-3 py-1.5 text-background disabled:opacity-60"
        >
          {checking ? "Đang kiểm tra…" : "Kiểm tra ngay"}
        </button>
        <span className="opacity-70">Tự làm mới mỗi 30 giây</span>
        <span className="opacity-70">
          Cảnh báo Telegram: <strong>{data.alertsEnabled ? "đang bật" : "đang tắt"}</strong> (
          <Link className="underline" href={`${base}/cau-hinh`}>
            cấu hình
          </Link>
          )
        </span>
      </div>
      {actionError && <p className={errorClass}>{actionError}</p>}
      {!data.monitoringEnabled && (
        <p className="rounded border border-amber-600/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Job kiểm tra định kỳ đang tắt (MONITORING_ENABLED=false hoặc chưa có Redis). Số liệu chỉ cập nhật khi bấm “Kiểm tra ngay”.
        </p>
      )}

      {data.openAlerts.length > 0 && (
        <section aria-labelledby="canh-bao-mo" className="space-y-2 rounded-lg border border-red-600/40 p-3">
          <h2 id="canh-bao-mo" className="font-semibold text-red-700 dark:text-red-400">
            ⚠ {data.openAlerts.length} cảnh báo đang mở
          </h2>
          <ul className="space-y-1 text-sm">
            {data.openAlerts.slice(0, 5).map((a) => (
              <li key={a.id}>
                <span className="font-medium">{ALERT_KIND_NAMES[a.kind]}:</span> {a.title}{" "}
                <span className="opacity-60">({formatDateTime(a.openedAt)})</span>
              </li>
            ))}
          </ul>
          <Link href={`${base}/giam-sat`} className="text-sm underline">
            Xem và xử lý ở trang Giám sát và bảo mật
          </Link>
        </section>
      )}

      <section aria-labelledby="dich-vu" className="space-y-2">
        <h2 id="dich-vu" className="text-lg font-semibold">
          Dịch vụ {down.length > 0 && <span className="text-red-700 dark:text-red-400">– {down.length} đang ngừng</span>}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {data.services.map((s) => (
            <li key={s.service} className="space-y-1 rounded-lg border border-black/10 p-3 dark:border-white/15">
              <p className="font-medium">{s.name}</p>
              <StatusBadge status={s.status} />
              <p className="break-words text-xs opacity-70">
                {s.latencyMs !== null && `${s.latencyMs} ms · `}
                {s.message}
              </p>
              {s.checkedAt && <p className="text-xs opacity-60">Kiểm tra lúc {formatDateTime(s.checkedAt)}</p>}
            </li>
          ))}
        </ul>
      </section>

      <section aria-label="Số liệu chính" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Lỗi máy chủ (24 giờ)" value={errors24h.toLocaleString("vi-VN")} alert={errors24h > 0} href={`${base}/giam-sat?tab=loi`} />
        <Tile label="Đăng nhập sai (24 giờ)" value={data.failedLogins24h.toLocaleString("vi-VN")} href={`${base}/giam-sat?tab=bao-mat`} />
        <Tile label="Đang bị chặn tạm" value={data.blockedCount.toLocaleString("vi-VN")} note="IP / tài khoản nhập sai nhiều" href={`${base}/giam-sat?tab=bao-mat`} />
        <Tile label="Job thất bại đang lưu" value={failedJobs.toLocaleString("vi-VN")} alert={failedJobs > 0} href={`${base}/giam-sat?tab=hang-doi`} />
        <Tile
          label={data.storage?.driver === "local" ? "Dung lượng kho (local)" : "Dung lượng R2"}
          value={data.storage ? `${data.storage.percent.toLocaleString("vi-VN")}%` : "Chưa đo"}
          note={data.storage ? `${formatBytes(data.storage.totalBytes)} / ${formatBytes(data.storage.quotaBytes)} · đo lúc ${formatDateTime(data.storage.measuredAt)}` : "Đo mỗi giờ"}
          alert={!!data.storage && data.storage.driver === "r2" && data.storage.percent >= 80}
        />
      </section>

      <section aria-labelledby="loi-theo-gio" className="space-y-3">
        <h2 id="loi-theo-gio" className="text-lg font-semibold">
          Lỗi theo giờ
        </h2>
        <HourBars
          title="Số lỗi máy chủ (5xx) mỗi giờ"
          unit="lỗi"
          points={data.errorsByHour.map((h) => ({ hour: h.hour, value: h.count }))}
        />
        {data.topErrors.length > 0 && (
          <div className="space-y-1">
            <h3 className="text-sm font-medium">Nhóm lỗi hay gặp (7 ngày)</h3>
            <ul className="space-y-1 text-sm">
              {data.topErrors.map((e) => (
                <li key={e.id} className="break-words">
                  <span className="font-mono text-xs">{e.route}</span> · {e.count.toLocaleString("vi-VN")} lần · {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section aria-labelledby="do-tre" className="space-y-3">
        <h2 id="do-tre" className="text-lg font-semibold">
          Độ trễ 24 giờ (trung bình mỗi giờ)
        </h2>
        {latencies.length === 0 ? (
          <p className="text-sm opacity-70">Chưa có số liệu kiểm tra trong 24 giờ.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {latencies.map((l) => (
              <HourBars
                key={l.service}
                title={MONITOR_SERVICE_NAMES[l.service]}
                unit="ms"
                height={64}
                alertLabel="Giờ có lần ngừng"
                points={l.hours.map((h) => ({ hour: h.hour, value: h.avgMs, alert: h.down > 0 }))}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="hang-doi" className="space-y-2">
        <h2 id="hang-doi" className="text-lg font-semibold">
          Hàng đợi
        </h2>
        {!data.queue.enabled ? (
          <p className="text-sm text-amber-700">Đang tắt (chưa cấu hình Redis): bài hẹn giờ chưa tự đăng.</p>
        ) : data.queue.error ? (
          <p className={errorClass}>{data.queue.error}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 opacity-70 dark:border-white/15">
                  <th className="py-1 pr-3 font-normal">Hàng đợi</th>
                  <th className="py-1 pr-3 text-right font-normal">Chờ</th>
                  <th className="py-1 pr-3 text-right font-normal">Hẹn giờ</th>
                  <th className="py-1 pr-3 text-right font-normal">Đang chạy</th>
                  <th className="py-1 text-right font-normal">Thất bại</th>
                </tr>
              </thead>
              <tbody>
                {data.queue.queues.map((q) => (
                  <tr key={q.name} className="border-b border-black/5 dark:border-white/10">
                    <td className="py-1 pr-3 font-mono text-xs">{q.name}</td>
                    <td className="py-1 pr-3 text-right">{q.waiting}</td>
                    <td className="py-1 pr-3 text-right">{q.delayed}</td>
                    <td className="py-1 pr-3 text-right">{q.active}</td>
                    <td className={`py-1 text-right ${q.failed > 0 ? "font-semibold text-red-700 dark:text-red-400" : ""}`}>{q.failed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs opacity-60">
        Máy chủ API chạy {formatUptime(data.system.uptimeSec)} · bộ nhớ {data.system.memoryMb} MB · Node {data.system.node}
      </p>
    </div>
  );
}
