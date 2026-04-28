import { LockClosedIcon } from "@heroicons/react/24/outline";

import { AppStoreBadge } from "@/components/app-store-badge";

const BENEFITS = [
  "Full AI breakdown on every director deal — thesis, evidence, risks",
  "Real-time alerts the moment a director buys",
  "Track every director's record across the FTSE",
];

export function BlurredAnalysisOverlay() {
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-center pt-12 px-4">
      <div className="relative w-full max-w-md rounded-2xl border border-[#e8e0d5] dark:border-separator bg-[#faf7f2]/95 dark:bg-surface/95 backdrop-blur-md shadow-2xl px-6 py-6 text-center">
        <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-[#6b5038]/10 text-[#6b5038] dark:text-[#c4a882] mb-4">
          <LockClosedIcon className="w-5 h-5" />
        </span>
        <h3 className="text-lg font-semibold mb-1">Unlock the full analysis</h3>
        <p className="text-sm text-muted leading-relaxed mb-4">
          You&apos;ve used today&apos;s free analysis on the web. The DDBX app
          gives you the full read on every director deal — for free.
        </p>
        <ul className="text-left text-sm space-y-1.5 mb-5">
          {BENEFITS.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2 text-foreground/80"
            >
              <span className="text-[#6b5038] dark:text-[#c4a882] mt-0.5">
                ✓
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <AppStoreBadge size="md" />
        <p className="text-[11px] text-muted/60 mt-3">
          Free on iOS · No account required
        </p>
      </div>
    </div>
  );
}
