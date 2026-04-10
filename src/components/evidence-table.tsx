import type { EvidencePoint } from "../../worker/db/types";

export function EvidenceTable({
  title,
  points,
  tone,
}: {
  title: string;
  points: EvidencePoint[];
  tone: "for" | "against";
}) {
  const icon = tone === "for" ? "✓" : "✗";
  const iconColor = tone === "for" ? "text-green-400" : "text-red-400";

  if (points.length === 0) {
    return (
      <div>
        <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
          <span className={iconColor}>{icon}</span>
          {title}
        </h4>
        <p className="text-xs text-muted italic">None provided.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-lg font-bold mb-4 flex items-center gap-2">
        <span className={iconColor}>{icon}</span>
        {title}
      </h4>
      <div className="divide-y divide-black/10 dark:divide-white/10 border-y border-black/10 dark:border-white/10">
        {points.map((p, i) => {
          const headline = (p as any).headline ?? (p as any).point ?? "";
          const detail = (p as any).detail ?? "";
          const sourceLabel = (p as any).source_label ?? (p as any).source ?? "";
          const sourceUrl: string | undefined = (p as any).source_url;

          return (
            <div key={i} className="flex gap-3 py-4">
              <span className={`${iconColor} text-sm leading-relaxed shrink-0`}>{icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold leading-snug">{headline}</p>
                {detail && (
                  <p className="text-sm text-foreground/80 mt-1 leading-relaxed">
                    {detail}
                  </p>
                )}
                {sourceLabel && (
                  <p className="text-xs mt-2">
                    {sourceUrl ? (
                      <a
                        href={sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-blue-400 hover:text-blue-300 underline underline-offset-2"
                      >
                        {sourceLabel}
                        <svg className="w-3 h-3 shrink-0" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M4.5 3H3a1 1 0 0 0-1 1v5a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1V7.5M7 2h3m0 0v3m0-3L5 7" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </a>
                    ) : (
                      <span className="text-muted">{sourceLabel}</span>
                    )}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
