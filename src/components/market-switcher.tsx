import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

import { MARKETS, marketForPath } from "@/lib/markets/registry";

export function MarketSwitcher() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = marketForPath(location.pathname);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex items-center gap-1.5 rounded-full border border-separator/70 bg-surface/60 px-2 py-1 text-sm text-foreground/80 hover:bg-surface transition-colors"
        type="button"
        onClick={() => setOpen((v) => !v)}
      >
        <current.Flag
          aria-hidden
          className="h-3.5 w-5 rounded-sm object-cover"
        />
        <span className="font-medium">{current.label}</span>
        <ChevronDownIcon
          className={clsx("w-3 h-3 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 mt-2 w-28 rounded-xl border border-separator bg-[#f5f0e8] dark:bg-background shadow-lg overflow-hidden z-50"
          role="listbox"
        >
          {MARKETS.map((m) => {
            const isCurrent = m.code === current.code;
            const baseCls =
              "flex items-center gap-2 w-full px-2.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors";

            return (
              <Link
                key={m.code}
                className={baseCls}
                to={m.route}
                onClick={() => setOpen(false)}
              >
                <m.Flag
                  aria-hidden
                  className="h-3.5 w-5 rounded-sm object-cover"
                />
                <span className="flex-1 text-left">{m.label}</span>
                {isCurrent && (
                  <CheckIcon className="w-3.5 h-3.5 text-foreground/60" />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
