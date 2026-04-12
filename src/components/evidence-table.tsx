import type { EvidencePoint } from "../../worker/db/types";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/16/solid";

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
  const iconColor = tone === "for" ? "text-green-500" : "text-red-500";

  if (points.length === 0) {
    return (
      <div>
        <h4 className="text-lg font-bold mb-4">
          {title}
        </h4>
        <p className="text-xs text-muted italic">None provided.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-lg font-bold mb-4">
        {title}
      </h4>
      <div className="divide-y divide-black/10 dark:divide-white/10 border-b border-black/10 dark:border-white/10">
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
                        <ArrowTopRightOnSquareIcon className="w-3 h-3 shrink-0" />
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
