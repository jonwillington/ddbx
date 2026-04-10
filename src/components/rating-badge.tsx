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
  significant: "bg-[#5c3d28]/14 text-[#3d2610] border-[#7a5238]/40 font-bold",
  noteworthy:  "bg-[#8a7260]/12 text-[#52402e] border-[#8a7260]/35",
  minor:       "bg-[#c0b4a6]/10 text-[#7e766c] border-[#c0b4a6]/40 font-normal",
  routine:     "bg-transparent text-[#b0a898] border-[#d8d0c6]/60 font-normal",
};

export function RatingBadge({ rating, className }: { rating: Rating; className?: string }) {
  const normalized: Rating = LEGACY[rating as string] ?? rating;
  return (
    <span
      className={clsx(
        "inline-flex items-center justify-center w-28 rounded-md border py-1.5 text-xs font-semibold",
        STYLES[normalized] ?? "bg-neutral-500/15 text-neutral-400 border-neutral-500/30",
        className,
      )}
    >
      {LABELS[normalized] ?? rating}
    </span>
  );
}
