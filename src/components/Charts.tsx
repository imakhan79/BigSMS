"use client";

import { useState } from "react";

/**
 * Single-series charts in the theme's accent hue (one series, so no legend: the card title
 * names it). Percent scale 0-100, hairline grid, 2px line, 8px end marker, hover tooltip.
 */

export interface TrendPoint {
  label: string;
  value: number | null;
  /** How many records the value is based on, shown in the tooltip. */
  count?: number;
}

const W = 640;
const H = 200;
const PAD = { top: 12, right: 44, bottom: 26, left: 36 };

export function TrendChart({ points, unit = "%", countLabel = "records" }: { points: TrendPoint[]; unit?: string; countLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length <= 1 ? innerW / 2 : (i * innerW) / (points.length - 1));
  const y = (v: number) => PAD.top + innerH - (v / 100) * innerH;
  const defined = points.map((p, i) => ({ ...p, i })).filter((p) => p.value != null) as (TrendPoint & { i: number; value: number })[];

  // Break the line where a month has no data.
  const segments: (typeof defined)[] = [];
  defined.forEach((p, k) => {
    if (k === 0 || p.i !== defined[k - 1].i + 1) segments.push([p]);
    else segments[segments.length - 1].push(p);
  });
  const last = defined[defined.length - 1];
  const tip = hover != null ? points[hover] : null;

  if (!defined.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No data recorded in this period yet.</p>;
  }

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Trend by month" onMouseLeave={() => setHover(null)}>
        {[0, 25, 50, 75, 100].map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} className="stroke-border" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted-foreground text-[10px]">{t}</text>
          </g>
        ))}
        {points.map((p, i) =>
          i % Math.ceil(points.length / 6) === 0 || i === points.length - 1 ? (
            <text key={p.label} x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted-foreground text-[10px]">{p.label}</text>
          ) : null,
        )}
        {segments.map((seg, k) =>
          seg.length > 1 ? (
            <g key={k}>
              <path
                d={`M${seg.map((p) => `${x(p.i)},${y(p.value)}`).join("L")}L${x(seg[seg.length - 1].i)},${y(0)}L${x(seg[0].i)},${y(0)}Z`}
                className="fill-accent/10"
              />
              <path d={`M${seg.map((p) => `${x(p.i)},${y(p.value)}`).join("L")}`} className="fill-none stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            </g>
          ) : (
            <circle key={k} cx={x(seg[0].i)} cy={y(seg[0].value)} r={4} className="fill-accent stroke-surface" strokeWidth={2} />
          ),
        )}
        {last && (
          <>
            <circle cx={x(last.i)} cy={y(last.value)} r={4} className="fill-accent stroke-surface" strokeWidth={2} />
            <text x={x(last.i) + 8} y={y(last.value) + 4} className="fill-foreground text-[11px] font-medium">{last.value.toFixed(0)}{unit}</text>
          </>
        )}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-muted-foreground/50" strokeWidth={1} />}
        {hover != null && points[hover].value != null && (
          <circle cx={x(hover)} cy={y(points[hover].value!)} r={5} className="fill-accent stroke-surface" strokeWidth={2} />
        )}
        {points.map((p, i) => (
          <rect
            key={p.label}
            x={x(i) - innerW / Math.max(points.length - 1, 1) / 2}
            y={PAD.top}
            width={innerW / Math.max(points.length - 1, 1)}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(i)}
          />
        ))}
      </svg>
      {tip && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${(x(hover!) / W) * 100}%` }}
        >
          <p className="font-medium">{tip.label}</p>
          <p className="tabular-nums">{tip.value == null ? "No data" : `${tip.value.toFixed(1)}${unit}`}{tip.count != null ? ` · ${tip.count} ${countLabel}` : ""}</p>
        </div>
      )}
    </div>
  );
}

export interface BarItem {
  label: string;
  value: number | null;
  note?: string;
}

/** Horizontal bars on a 0-100% scale, value at the tip; bars under `alertBelow` get a warning label. */
export function BarList({ items, alertBelow }: { items: BarItem[]; alertBelow?: number }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">Nothing to show yet.</p>;
  return (
    <ul className="space-y-2.5">
      {items.map((it) => {
        const low = alertBelow != null && it.value != null && it.value < alertBelow;
        return (
          <li key={it.label} className="group relative grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_4.5rem] items-center gap-3 text-sm sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_5rem]">
            <span className="truncate" title={it.label}>{it.label}</span>
            <span className="relative h-4 rounded-r-[4px] bg-muted/60">
              {it.value != null && (
                <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-accent transition-opacity group-hover:opacity-80" style={{ width: `${Math.max(0, Math.min(100, it.value))}%` }} />
              )}
            </span>
            <span className="text-right tabular-nums">
              {it.value == null ? "—" : `${it.value.toFixed(0)}%`}
              {low && <span className="ml-1 text-[10px] font-medium text-danger">LOW</span>}
            </span>
            {it.note && (
              <span className="pointer-events-none absolute -top-7 left-1/3 z-10 hidden whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-md group-hover:block">
                {it.label}: {it.value == null ? "no data" : `${it.value.toFixed(1)}%`} · {it.note}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
