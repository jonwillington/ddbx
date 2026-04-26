// Small button card used inside the hero — UNIVERSE / WINDOW / HOLD / etc.
// Clicking it opens the corresponding criteria sheet.

interface Props {
  label: string; // uppercased badge label
  value: string; // current selection display name
  hint?: string; // optional right-aligned secondary label (e.g. "24 deals")
  onClick: () => void;
}

export function CriteriaCard({ label, value, hint, onClick }: Props) {
  return (
    <button
      className="w-full text-left rounded-lg border border-separator bg-surface/60 px-3 py-2.5 hover:bg-surface/80 transition-colors"
      type="button"
      onClick={onClick}
    >
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-base font-semibold truncate">{value}</span>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted">
          {hint != null && <span>{hint}</span>}
          <svg
            aria-hidden
            className="opacity-60"
            fill="none"
            height="11"
            viewBox="0 0 24 24"
            width="11"
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.5"
            />
          </svg>
        </span>
      </div>
    </button>
  );
}
