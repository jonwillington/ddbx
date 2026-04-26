import { VIEW_MODES, type PerformanceViewMode } from "@/lib/performance/types";

interface Props {
  value: PerformanceViewMode;
  onChange: (next: PerformanceViewMode) => void;
}

export function ViewModeToggle({ value, onChange }: Props) {
  return (
    <div className="inline-flex gap-1.5">
      {(Object.keys(VIEW_MODES) as PerformanceViewMode[]).map((mode) => {
        const active = mode === value;

        return (
          <button
            key={mode}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              active
                ? "bg-[#6b5038]/10 text-[#6b5038]"
                : "bg-surface/60 text-muted hover:bg-surface/80"
            }`}
            type="button"
            onClick={() => onChange(mode)}
          >
            {VIEW_MODES[mode].displayName}
          </button>
        );
      })}
    </div>
  );
}
