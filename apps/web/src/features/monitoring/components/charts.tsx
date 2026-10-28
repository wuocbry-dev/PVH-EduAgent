"use client";

import { HEALTH_STATUS_NAMES, type HealthStatus } from "@pvh/shared";
import { useState } from "react";

const TIME_ZONE = "Asia/Ho_Chi_Minh";

export const hourLabel = (iso: string) =>
  `${new Date(iso).toLocaleTimeString("vi-VN", { timeZone: TIME_ZONE, hour: "2-digit", hour12: false })}:00`;

// Màu trạng thái cố định (không dùng cho chuỗi dữ liệu), luôn đi kèm biểu tượng và chữ.
const STATUS_STYLE: Record<HealthStatus, { icon: string; dot: string }> = {
  OK: { icon: "✓", dot: "bg-[#0ca30c] text-white" },
  DEGRADED: { icon: "!", dot: "bg-[#fab219] text-[#0b0b0b]" },
  DOWN: { icon: "✕", dot: "bg-[#d03b3b] text-white" },
  OFF: { icon: "–", dot: "bg-black/15 text-black/70 dark:bg-white/20 dark:text-white/80" },
};

export function StatusBadge({ status }: { status: HealthStatus }) {
  const style = STATUS_STYLE[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span aria-hidden className={`inline-flex size-5 items-center justify-center rounded-full text-xs font-bold ${style.dot}`}>
        {style.icon}
      </span>
      {HEALTH_STATUS_NAMES[status]}
    </span>
  );
}

export interface HourPoint {
  hour: string; // ISO đầu giờ
  value: number | null;
  alert?: boolean; // giờ có sự cố (tô màu "ngừng" + chú thích chữ)
}

// Biểu đồ cột một chuỗi theo giờ: cột mảnh, đầu bo 4px, khe 2px; rê chuột/chạm để xem số; có bảng số liệu thay thế.
export function HourBars({
  title,
  points,
  unit,
  alertLabel,
  height = 96,
  labelOf = hourLabel,
  rangeLabel = "24 giờ gần nhất",
  keyHeader = "Giờ",
}: {
  title: string;
  points: HourPoint[];
  unit: string;
  alertLabel?: string;
  height?: number;
  // Biểu đồ theo ngày (bước 27) đổi nhãn trục, mô tả khoảng thời gian và tên cột của bảng số liệu.
  labelOf?: (key: string) => string;
  rangeLabel?: string;
  keyHeader?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  // Nhãn dùng giá trị lớn nhất thật; thang chiều cao tối thiểu 1 để không chia cho 0.
  const top = Math.max(0, ...points.map((p) => p.value ?? 0));
  const max = Math.max(1, top);
  const shown = active === null ? null : points[active];
  const hasAlert = points.some((p) => p.alert);
  const describe = (p: HourPoint) => `${labelOf(p.hour)}: ${p.value === null ? "không có số liệu" : `${p.value.toLocaleString("vi-VN")} ${unit}`}${p.alert && alertLabel ? ` · ${alertLabel.toLowerCase()}` : ""}`;

  return (
    <figure className="min-w-0 space-y-1">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-xs opacity-70" aria-live="polite">
          {shown ? describe(shown) : `Cao nhất ${top.toLocaleString("vi-VN")} ${unit}`}
        </span>
      </figcaption>
      <div
        className="flex items-end gap-[2px] border-b border-black/20 dark:border-white/25"
        style={{ height }}
        role="img"
        aria-label={`${title}, ${rangeLabel}`}
        onMouseLeave={() => setActive(null)}
      >
        {points.map((p, i) => (
          <button
            key={p.hour}
            type="button"
            aria-label={describe(p)}
            onMouseEnter={() => setActive(i)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
            className="group flex h-full min-w-0 flex-1 items-end focus:outline-none"
          >
            <span
              className={`block w-full rounded-t-[4px] ${
                p.alert ? "bg-[#d03b3b]" : "bg-[#2a78d6] dark:bg-[#3987e5]"
              } ${active === i ? "opacity-100 ring-2 ring-black/40 dark:ring-white/50" : "opacity-90 group-hover:opacity-100"}`}
              style={{ height: p.value ? `${Math.max(4, (p.value / max) * 100)}%` : p.alert ? "4px" : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] opacity-60">
        <span>{points[0] ? labelOf(points[0].hour) : ""}</span>
        <span>{points.at(-1) ? labelOf(points.at(-1)!.hour) : ""}</span>
      </div>
      {hasAlert && alertLabel && (
        <p className="flex items-center gap-1 text-xs opacity-80">
          <span aria-hidden className="inline-block size-2.5 rounded-sm bg-[#d03b3b]" /> ✕ {alertLabel}
        </p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer opacity-70">Xem bảng số liệu</summary>
        <table className="mt-1 w-full text-left">
          <thead>
            <tr className="opacity-70">
              <th className="pr-2 font-normal">{keyHeader}</th>
              <th className="pr-2 font-normal">Giá trị ({unit})</th>
              {alertLabel && <th className="font-normal">{alertLabel}</th>}
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.hour}>
                <td className="pr-2">{labelOf(p.hour)}</td>
                <td className="pr-2">{p.value === null ? "–" : p.value.toLocaleString("vi-VN")}</td>
                {alertLabel && <td>{p.alert ? "Có" : ""}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
