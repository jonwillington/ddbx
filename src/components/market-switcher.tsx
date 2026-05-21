import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

import {
  MARKETS,
  REGION_LABEL,
  REGION_ORDER,
  marketForPath,
  type MarketRegion,
  type MarketRegistryEntry,
} from "@/lib/markets/registry";

export function MarketSwitcher() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = marketForPath(location.pathname);
  const sections = useMemo<
    { region: MarketRegion; markets: MarketRegistryEntry[] }[]
  >(
    () =>
      REGION_ORDER.map((region) => ({
        region,
        markets: MARKETS.filter((m) => m.region === region),
      })).filter((s) => s.markets.length > 0),
    [],
  );

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
          className="absolute left-0 mt-2 w-36 rounded-xl border border-separator bg-[#f5f0e8] dark:bg-background shadow-lg overflow-hidden z-50 py-1"
          role="listbox"
        >
          {sections.map((section, i) => (
            <Fragment key={section.region}>
              {i > 0 && (
                <div className="my-1 border-t border-separator/60" />
              )}
              <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-foreground/45">
                {REGION_LABEL[section.region]}
              </div>
              {section.markets.map((m) => {
                const isCurrent = m.code === current.code;

                return (
                  <Link
                    key={m.code}
                    className="flex items-center gap-2 w-full px-2.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
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
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
