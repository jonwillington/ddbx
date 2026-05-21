import type { ChartAnchor, ChartAxis, ChartMode } from "@/lib/markets/types";

interface MarketChartModeToggleProps {
  mode: ChartMode;
  onChange: (mode: ChartMode) => void;
  /** Short benchmark label rendered inside the "vs Market" pill so the
   *  user can see which index they're comparing against. */
  benchmarkLabel: string;
}

/** Two stacked pill groups that drive the per-row sparkline + Performance
 *  cell. Mirrors the iOS `DashboardMetricMode` segmented control. */
export function MarketChartModeToggle({
  mode,
  onChange,
  benchmarkLabel,
}: MarketChartModeToggleProps) {
  const axisPills: { id: ChartAxis; label: string }[] = [
    { id: "raw", label: "Raw" },
    { id: "market", label: `vs ${benchmarkLabel}` },
  ];
  const anchorPills: { id: ChartAnchor; label: string }[] = [
    { id: "trade", label: "From trade" },
    { id: "disclosure", label: "From disclosure" },
  ];

  return (
    <div className="flex items-center gap-1.5">
      <PillGroup
        items={axisPills}
        selected={mode.axis}
        onChange={(axis) => onChange({ ...mode, axis })}
      />
      <PillGroup
        items={anchorPills}
        selected={mode.anchor}
        onChange={(anchor) => onChange({ ...mode, anchor })}
      />
    </div>
  );
}

function PillGroup<T extends string>({
  items,
  selected,
  onChange,
}: {
  items: { id: T; label: string }[];
  selected: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-separator bg-surface/40 p-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          aria-pressed={selected === item.id}
          className={`text-[11px] px-2.5 py-0.5 rounded-full transition-colors font-medium whitespace-nowrap ${
            selected === item.id
              ? "bg-[#6b5038]/15 text-[#4a3520] dark:text-[#c4a882]"
              : "text-muted hover:text-foreground"
          }`}
          type="button"
          onClick={() => onChange(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
