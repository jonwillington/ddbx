import clsx from "clsx";

import type { Rating } from "@/lib/api";

// Legacy rating values from before migration 003 — map to new labels.
const LEGACY: Record<string, Rating> = {
  very_interesting: "significant",
  interesting: "noteworthy",
  somewhat: "minor",
  not_interesting: "routine",
};

const LABELS: Record<Rating, string> = {
  significant: "Significant",
  noteworthy: "Noteworthy",
  minor: "Minor",
  routine: "Routine",
};

const STYLES: Record<Rating, string> = {
  significant: "bg-[#8b4513]/18 text-[#6b2f0a] border-[#8b4513]/40 font-bold dark:bg-[#d4845a]/15 dark:text-[#e8a878] dark:border-[#d4845a]/35",
  noteworthy:  "bg-[#6b5038]/14 text-[#4a3520] border-[#6b5038]/35 dark:bg-[#b8956e]/12 dark:text-[#c4a882] dark:border-[#b8956e]/30",
  minor:       "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40 font-normal",
  routine:     "bg-transparent text-[#b0a898] border-[#d8d0c6]/60 font-normal",
};

export function RatingBadge({ rating, className }: { rating: Rating; className?: string }) {
  const normalized: Rating = LEGACY[rating as string] ?? rating;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center w-32 rounded-md border py-2 text-sm font-semibold",
        STYLES[normalized] ?? "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
        className,
      )}
    >
      {LABELS[normalized] ?? rating}
    </span>
  );
}
