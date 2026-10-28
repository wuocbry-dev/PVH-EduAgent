"use client";

import { AGENT_SWITCH_KEYS, ALERT_KIND_NAMES, ROLE_NAMES, SETTING_META, type AgentStatsDto, type AgentSwitchKey, type Role } from "@pvh/shared";
import { useEffect, useState } from "react";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass } from "@/shared/ui/form-styles";
import { getAgentStats, setAgentSwitch } from "../api/monitoring-api";
import { HourBars } from "./charts";

const REFRESH_MS = 60_000;
const DAYS = [7, 14, 30] as const;
const ACTION_STATUS: Record<string, string> = {
  PENDING: "Chờ xác nhận",
  CONFIRMED: "Đã xác nhận",
  DONE: "Đã thực hiện",
  FAILED: "Thực hiện lỗi",
  CANCELLED: "Bị huỷ",
  EXPIRED: "Hết hạn",
};
const th = "py-1 pr-3 font-normal";
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const usd = (v: number) => `${v.toLocaleString("vi-VN", { maximumFractionDigits: 4 })} USD`;
const percent = (used: number, limit: number) => (limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0);

// Trang Trợ lý AI của cổng /admin (bước 27): chỉ số lượng và tên tool, không có nội dung hội thoại.
export function AgentMonitor() {
  const [days, setDays] = useState<number>(14);
  const { data, error, reload } = useData(getAgentStats, days);

  useEffect(() => {
    const timer = setInterval(reload, REFRESH_MS);
    return () => clearInterval(timer);
  }, [reload]);

  if (error && !data) return <p className={errorClass}>{error}</p>;
  if (!data) return <p className="text-sm opacity-60">Đang tải…</p>;
  return <AgentStats data={data} days={days} onDays={setDays} reload={reload} />;
}

function AgentStats({ data, days, onDays, reload }: { data: AgentStatsDto; days: number; onDays: (d: number) => void; reload: () => void }) {
  const total = data.days.reduce((s, d) => s + d.web + d.telegram, 0);
  const errors = data.days.reduce((s, d) => s + d.errors, 0);
  const flagged = data.days.reduce((s, d) => s + d.flagged, 0);
  const cost = data.days.reduce((s, d) => s + d.costUsd, 0);
  const { today } = data;

  return (
    <div className="space-y-6">
      <Switches switches={data.switches} reload={reload} />

      <section aria-labelledby="ai-hom-nay" className="space-y-2">
        <h2 id="ai-hom-nay" className="text-lg font-semibold">
          Hôm nay
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meter label="Lệnh toàn hệ thống" used={today.commands} limit={today.limits.total} text={`${today.commands.toLocaleString("vi-VN")} / ${today.limits.total.toLocaleString("vi-VN")}`} />
          <Meter label="Chi phí Claude" used={today.costUsd} limit={today.limits.costUsd} text={`${usd(today.costUsd)} / ${usd(today.limits.costUsd)}`} />
          <Tile label="Trần mỗi người/ngày" value={`${today.limits.perUser.toLocaleString("vi-VN")} lệnh`} />
          <Tile label="Báo lạm dụng khi một người quá" value={`${today.limits.hourlyAlert.toLocaleString("vi-VN")} lệnh/giờ`} />
        </div>
        <p className="text-xs opacity-70">Hạn mức chỉnh ở trang Cấu hình (agent.*). Ngày tính theo giờ Việt Nam.</p>
      </section>

      <section aria-labelledby="ai-theo-ngay" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="ai-theo-ngay" className="text-lg font-semibold">
            Lệnh theo ngày
          </h2>
          <div className="flex gap-1" role="group" aria-label="Khoảng thời gian">
            {DAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDays(d)}
                aria-pressed={days === d}
                className={`rounded px-2 py-1 text-sm ${days === d ? "bg-foreground text-background" : "border border-black/20 dark:border-white/25"}`}
              >
                {d} ngày
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label={`Tổng lệnh (${days} ngày)`} value={total.toLocaleString("vi-VN")} />
          <Tile label="Lệnh lỗi" value={errors.toLocaleString("vi-VN")} alert={errors > 0} />
          <Tile label="Tin nghi tiêm lệnh (chỉ đánh dấu)" value={flagged.toLocaleString("vi-VN")} alert={flagged > 0} />
          <Tile label="Chi phí Claude" value={usd(Math.round(cost * 10_000) / 10_000)} />
        </div>
        <HourBars
          title="Số lệnh mỗi ngày (web + Telegram)"
          unit="lệnh"
          labelOf={dayLabel}
          rangeLabel={`${days} ngày gần nhất`}
          keyHeader="Ngày"
          alertLabel="Ngày có tin nghi tiêm lệnh"
          points={data.days.map((d) => ({ hour: d.day, value: d.web + d.telegram, alert: d.flagged > 0 }))}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <SimpleTable
            caption="Theo kênh"
            head={["Kênh", "Lệnh"]}
            rows={[
              ["Web", data.days.reduce((s, d) => s + d.web, 0)],
              ["Telegram", data.days.reduce((s, d) => s + d.telegram, 0)],
            ]}
          />
          <SimpleTable
            caption="Theo vai trò (người có nhiều vai trò được tính ở mỗi vai trò)"
            head={["Vai trò", "Lệnh"]}
            rows={data.byRole.map((r) => [ROLE_NAMES[r.role as Role] ?? r.role, r.commands])}
          />
        </div>
      </section>

      <section aria-labelledby="ai-tool" className="space-y-2">
        <h2 id="ai-tool" className="text-lg font-semibold">
          Tool được gọi
        </h2>
        {data.tools.length === 0 ? (
          <p className="text-sm opacity-70">Chưa có tool nào được gọi trong khoảng này.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 opacity-70 dark:border-white/15">
                  <th className={th}>Tool</th>
                  <th className={`${th} text-right`}>Lượt gọi</th>
                  <th className={`${th} text-right`}>Lỗi</th>
                  <th className={`${th} text-right`}>Thiếu quyền</th>
                  <th className={`${th} text-right`}>Tỷ lệ lỗi</th>
                </tr>
              </thead>
              <tbody>
                {data.tools.map((t) => (
                  <tr key={t.tool} className="border-b border-black/5 dark:border-white/10">
                    <td className="py-1 pr-3 font-mono text-xs">{t.tool}</td>
                    <td className="py-1 pr-3 text-right">{t.calls.toLocaleString("vi-VN")}</td>
                    <td className="py-1 pr-3 text-right">{t.errors.toLocaleString("vi-VN")}</td>
                    <td className="py-1 pr-3 text-right">{t.denied.toLocaleString("vi-VN")}</td>
                    <td className="py-1 pr-3 text-right">{t.calls ? `${Math.round((t.errors / t.calls) * 100)}%` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <SimpleTable
          caption="Thao tác cần xác nhận 2 bước"
          head={["Trạng thái", "Số lượng"]}
          rows={data.actions.map((a) => [ACTION_STATUS[a.status] ?? a.status, a.count])}
        />
      </section>

      <section aria-labelledby="ai-canh-bao" className="space-y-2">
        <h2 id="ai-canh-bao" className="text-lg font-semibold">
          Cảnh báo về Trợ lý AI
        </h2>
        {data.alerts.length === 0 ? (
          <p className="text-sm opacity-70">Chưa có cảnh báo nào.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.alerts.map((a) => (
              <li key={a.id} className="break-words">
                <span className="opacity-70">{formatDateTime(a.openedAt)}</span> · <span className="font-medium">{ALERT_KIND_NAMES[a.kind]}:</span> {a.title}
                {a.detail && <span className="opacity-80"> – {a.detail}</span>}
                {!a.resolvedAt && <span className="text-red-700 dark:text-red-400"> (đang mở)</span>}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs opacity-70">Trang này chỉ hiện số lượng và tên tool; nội dung trò chuyện không được lưu hay hiển thị ở đây.</p>
      </section>
    </div>
  );
}

// Công tắc khẩn cấp: mỗi lần đổi đều hỏi xác nhận; đổi xong có ghi nhật ký và báo ADMIN qua Telegram.
function Switches({ switches, reload }: { switches: Record<AgentSwitchKey, boolean>; reload: () => void }) {
  const [busy, setBusy] = useState<AgentSwitchKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: AgentSwitchKey) {
    const next = !switches[key];
    const what = SETTING_META[key].label;
    if (!window.confirm(`${next ? "BẬT" : "TẮT"}: ${what}?\n\n${SETTING_META[key].description}`)) return;
    setBusy(key);
    setError(null);
    try {
      await setAgentSwitch(key, next);
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="cong-tac" className="space-y-2 rounded-lg border border-black/10 p-3 dark:border-white/15">
      <h2 id="cong-tac" className="text-lg font-semibold">
        Công tắc khẩn cấp
      </h2>
      {error && <p className={errorClass}>{error}</p>}
      <ul className="space-y-2">
        {AGENT_SWITCH_KEYS.map((key) => {
          const on = switches[key];
          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{SETTING_META[key].label}</p>
                <p className="text-xs opacity-70">{SETTING_META[key].description}</p>
              </div>
              <span className={`text-sm font-semibold ${on ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
                {on ? "✓ Đang bật" : "✕ Đang tắt"}
              </span>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => toggle(key)}
                className={`rounded px-3 py-1.5 text-sm disabled:opacity-50 ${on ? "bg-red-700 text-white" : "bg-foreground text-background"}`}
              >
                {busy === key ? "Đang đổi…" : on ? "Tắt" : "Bật lại"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tile({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm opacity-70">{label}</p>
      <p className={`text-xl font-bold ${alert ? "text-red-700 dark:text-red-400" : ""}`}>
        {alert && <span aria-hidden>⚠ </span>}
        {value}
      </p>
    </div>
  );
}

// Mức dùng so với hạn mức: thanh ngang một màu, kèm số và phần trăm bằng chữ.
function Meter({ label, used, limit, text }: { label: string; used: number; limit: number; text: string }) {
  const p = percent(used, limit);
  return (
    <div className="space-y-1 rounded-lg border border-black/10 p-3 dark:border-white/15">
      <p className="text-sm opacity-70">{label}</p>
      <p className="text-lg font-bold">{text}</p>
      <div className="h-2 rounded bg-black/10 dark:bg-white/15" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={`${label}: ${p}%`}>
        <div className={`h-2 rounded ${p >= 90 ? "bg-[#d03b3b]" : "bg-[#2a78d6] dark:bg-[#3987e5]"}`} style={{ width: `${p}%` }} />
      </div>
      <p className="text-xs opacity-70">
        {p >= 90 && <span aria-hidden>⚠ </span>}
        {p}% hạn mức
      </p>
    </div>
  );
}

function SimpleTable({ caption, head, rows }: { caption: string; head: [string, string]; rows: (string | number)[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <caption className="mb-1 text-left text-sm font-medium">{caption}</caption>
      <thead>
        <tr className="border-b border-black/10 opacity-70 dark:border-white/15">
          <th className={th}>{head[0]}</th>
          <th className={`${th} text-right`}>{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={2} className="py-1 opacity-70">
              Chưa có số liệu.
            </td>
          </tr>
        ) : (
          rows.map(([k, v]) => (
            <tr key={String(k)} className="border-b border-black/5 dark:border-white/10">
              <td className="py-1 pr-3">{k}</td>
              <td className="py-1 pr-3 text-right">{typeof v === "number" ? v.toLocaleString("vi-VN") : v}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
