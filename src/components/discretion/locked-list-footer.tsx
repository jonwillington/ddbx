import { LockClosedIcon } from "@heroicons/react/24/outline";

import { AppStoreBadge } from "@/components/app-store-badge";

export function LockedListFooter({ hiddenCount }: { hiddenCount: number }) {
  return (
    <div className="rounded-xl border border-[#e8e0d5] dark:border-separator bg-[#faf7f2] dark:bg-surface px-6 py-7 flex flex-col items-center gap-3 text-center">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#6b5038]/10 text-[#6b5038] dark:text-[#c4a882]">
        <LockClosedIcon className="w-4 h-4" />
      </span>
      <div>
        <div className="text-base font-semibold">
          {hiddenCount > 0
            ? `${hiddenCount.toLocaleString("en-GB")} more deals waiting in the app`
            : "See every director deal in the app"}
        </div>
        <p className="text-sm text-muted mt-1 max-w-md">
          The web shows a daily taste. The DDBX app is where you get the full
          history, real-time alerts, and every analysed signal.
        </p>
      </div>
      <AppStoreBadge className="mt-1" size="md" />
    </div>
  );
}
