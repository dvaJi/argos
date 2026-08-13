import { useMemo } from "react";
import { areaY, d3Curve, defineChart, lineY } from "@tanstack/charts";
import { motion } from "@tanstack/charts/motion";
import { scaleLinear } from "@tanstack/charts/scales/linear";
import { scalePoint } from "@tanstack/charts/scales/point";
import { tooltip } from "@tanstack/charts/tooltip";
import { RendererChart } from "@tanstack/charts/react/tooltip";
import { curveMonotoneX } from "d3-shape";
import type { UsageDailySeriesPoint } from "@argos/shared-contracts/routes";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 2,
});

const compactTokens = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

interface DailyUsageChartProps {
  points: UsageDailySeriesPoint[];
  mode: "cost" | "tokens";
}

const monotone = d3Curve(curveMonotoneX);

/** Spring motion: crisp, weighty, respects reduced motion. */
const springTransition = {
  type: "spring" as const,
  stiffness: 180,
  damping: 24,
  mass: 0.8,
};

interface ChartRow {
  id: string;
  date: string;
  value: number;
}

export function DailyUsageChart({ points, mode }: DailyUsageChartProps) {
  const definition = useMemo(() => {
    const rows: ChartRow[] = points.map((point, index) => ({
      id: `${mode}-${index}-${point.date}`,
      date: point.date,
      value: mode === "cost" ? (point.costUsd ?? 0) : point.totalTokens,
    }));
    const values = rows.map((row) => row.value);
    const minimum = Math.min(...values, 0);
    const maximum = Math.max(...values, 1);
    const padding = Math.max((maximum - minimum) * 0.16, 0.1);
    // Area baseline at 0 (values are never negative); Y domain starts at 0 so
    // the axis reads honestly.
    const baseline = 0;
    const accent = "var(--chart-1)";

    const line = lineY(rows, {
      id: `${mode}-line`,
      x: "date",
      y: "value",
      key: "id",
      stroke: accent,
      strokeWidth: 2.4,
      curve: monotone,
    });

    const marks = [
      ...(mode === "cost"
        ? [
            areaY(rows, {
              id: `${mode}-area`,
              x: "date",
              y: "value",
              y1: baseline,
              key: "id",
              fill: `url(#${mode}-fill)`,
              fillOpacity: 1,
              curve: monotone,
            }),
          ]
        : []),
      line,
    ];

    return defineChart({
      marks,
      gradients:
        mode === "cost"
          ? [
              {
                id: `${mode}-fill`,
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 1,
                stops: [
                  { offset: 0, color: accent, opacity: 0.26 },
                  { offset: 1, color: accent, opacity: 0 },
                ],
              },
            ]
          : [],
      x: {
        scale: () => scalePoint().padding(0.08),
        axis: {
          label: "Date",
          line: true,
          ticks: { count: Math.min(rows.length, 6), format: (value) => String(value).slice(5) },
          tickLabels: {
            fontSize: 11,
            opacity: 0.7,
            thin: { minGap: 24, priority: "ends" },
          },
        },
      },
      y: {
        scale: scaleLinear().domain([baseline, maximum + padding]),
        axis: {
          label: mode === "cost" ? "Cost (USD)" : "Tokens",
          line: true,
          ticks: {
            count: 5,
            format: (value) => (mode === "cost" ? currency.format(Number(value)) : compactTokens.format(Number(value))),
          },
          tickLabels: { fontSize: 11, opacity: 0.7 },
        },
      },
      margin: { top: 12, right: 12, bottom: 28, left: 52 },
      clip: true,
      guides: true,
      pointer: true,
      keyboard: false,
      tooltip: {
        use: tooltip,
        className: "ts-chart-tooltip--flush",
        content: (points) => {
          const point = points[0];
          // `point.x`/`point.y` are pixel positions; the datum values live in
          // `xValue`/`yValue` (or the original row on `datum`).
          const rawDate = point?.xValue as unknown;
          const rawValue = point?.yValue as unknown;
          const dateLabel =
            typeof rawDate === "string" && rawDate.length >= 10
              ? new Date(`${rawDate.slice(0, 10)}T00:00:00`).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })
              : String(rawDate ?? "");
          const value = typeof rawValue === "number" ? rawValue : Number(rawValue ?? 0);
          return {
            title: dateLabel,
            rows: [
              {
                label: mode === "cost" ? "Cost" : "Tokens",
                value: mode === "cost" ? currency.format(value) : compactTokens.format(value),
                color: accent,
              },
            ],
          };
        },
      },
      svgAnimation: false,
      motion: { transition: springTransition },
    });
  }, [points, mode]);

  const renderer = useMemo(
    () =>
      motion({
        initial: true,
        respectReducedMotion: true,
        transition: springTransition,
      }),
    [],
  );

  return (
    <RendererChart
      definition={definition as never}
      renderer={renderer as never}
      height={280}
      ariaLabel="Daily usage"
      ariaDescription="Daily cost or tokens over the selected window"
      renderTooltipBody={({ content }) => {
        // Single themed card rendered from the structured tooltip content; no
        // nested default body (which double-cards) and no fixed light-only colors.
        const rows = typeof content === "string" ? [] : (content.rows ?? []);
        const title = typeof content === "string" ? content : (content.title ?? "");
        return (
          <div className="flex min-w-36 flex-col gap-1.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
            {title ? <span className="font-medium">{title}</span> : null}
            {rows.length > 0 && (
              <div className="flex flex-col gap-0.5">
                {rows.map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {row.color ? (
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: row.color }} />
                      ) : null}
                      {row.label}
                    </span>
                    <span className="font-medium tabular-nums text-foreground">{row.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      }}
    />
  );
}
