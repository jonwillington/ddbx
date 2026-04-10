import type { PortfolioPoint } from "../../worker/db/types";

export interface ChartLine {
  label: string;
  color: string;
  points: PortfolioPoint[];
}

export function PerformanceChart({
  lines,
  width = 720,
  height = 220,
  headerLabel,
}: {
  lines: ChartLine[];
  width?: number;
  height?: number;
  headerLabel?: string;
}) {
  const validLines = lines.filter((l) => l.points.length >= 2);
  if (validLines.length === 0) {
    return <div className="text-sm text-muted">Not enough data yet.</div>;
  }

  const pad = 32;
  const allValues = validLines.flatMap((l) => l.points.map((p) => p.value_gbp));
  const yMin = Math.min(...allValues);
  const yMax = Math.max(...allValues);
  const yRange = yMax - yMin || 1;

  const maxLen = Math.max(...validLines.map((l) => l.points.length));
  const xScale = (i: number) =>
    pad + (i / Math.max(maxLen - 1, 1)) * (width - pad * 2);
  const yScale = (y: number) =>
    height - pad - ((y - yMin) / yRange) * (height - pad * 2);

  const firstLine = validLines[0];
  const first = firstLine.points[0];
  const last = firstLine.points[firstLine.points.length - 1];
  const change = (last.value_gbp - first.value_gbp) / first.value_gbp;

  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="text-xs text-muted">
          {headerLabel ?? "Normalised portfolio value"} · {first.date} → {last.date} ·{" "}
          <span className={change >= 0 ? "text-green-400" : "text-red-400"}>
            {change >= 0 ? "+" : ""}
            {(change * 100).toFixed(1)}%
          </span>
        </div>
        {validLines.length > 1 && (
          <div className="flex gap-4">
            {validLines.map((line) => (
              <div key={line.label} className="flex items-center gap-1.5 text-xs text-muted">
                <span
                  className="w-4 h-0.5 inline-block rounded"
                  style={{ backgroundColor: line.color }}
                />
                {line.label}
              </div>
            ))}
          </div>
        )}
      </div>
      <svg
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        width={width}
      >
        {validLines.map((line) => {
          const path = line.points
            .map((p, i) => `${i === 0 ? "M" : "L"} ${xScale(i)} ${yScale(p.value_gbp)}`)
            .join(" ");
          return (
            <g key={line.label}>
              <path
                d={path}
                fill="none"
                stroke={line.color}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
              {line.points.map((p, i) => (
                <circle
                  key={i}
                  cx={xScale(i)}
                  cy={yScale(p.value_gbp)}
                  fill={line.color}
                  r={2.5}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
