import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

const APP_STORE_URL =
  "https://apps.apple.com/us/app/ddbx-uk/id6762196330?itscg=30200&itsct=apps_box_badge&mttnsubad=6762196330";

// Tease at the bottom of a day's group when discretion mode has trimmed
// the visible rows. Whole row links to the App Store.
export function DayMoreInApp({
  count,
  variant = "row",
}: {
  count: number;
  variant?: "row" | "compact";
}) {
  if (count <= 0) return null;
  const noun = count === 1 ? "trade" : "trades";

  if (variant === "compact") {
    return (
      <a
        className="flex items-center gap-1 px-4 py-2 text-[11px] text-muted hover:text-[#6b5038] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
        href={APP_STORE_URL}
        rel="noopener noreferrer"
        target="_blank"
      >
        <span>+ {count} more {noun}</span>
        <span className="opacity-60">· in the app</span>
        <ArrowTopRightOnSquareIcon className="w-3 h-3 ml-auto opacity-50" />
      </a>
    );
  }

  return (
    <a
      className="flex items-center gap-2 px-6 py-3 text-xs text-muted hover:text-[#6b5038] hover:bg-black/[0.02] dark:hover:bg-white/[0.03] transition-colors"
      href={APP_STORE_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <span className="font-medium">+ {count} more {noun} on this day</span>
      <span className="opacity-70">· See them in the iOS app</span>
      <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 ml-auto opacity-60" />
    </a>
  );
}
