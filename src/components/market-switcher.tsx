import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import { GB, SE, US } from "country-flag-icons/react/3x2";
import clsx from "clsx";

type FlagIcon = typeof GB;

type Market = {
  code: string;
  label: string;
  Flag: FlagIcon;
  route?: string;
  href?: string;
  enabled: boolean;
};

const MARKETS: Market[] = [
  { code: "UK", label: "UK", Flag: GB, route: "/", enabled: true },
  { code: "US", label: "US", Flag: US, route: "/us", enabled: true },
  { code: "SE", label: "SE", Flag: SE, route: "/se", enabled: true },
];

function activeMarket(pathname: string): Market {
  if (pathname.startsWith("/us")) return MARKETS[1];
  if (pathname.startsWith("/se")) return MARKETS[2];
  return MARKETS[0];
}

export function MarketSwitcher() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = activeMarket(location.pathname);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
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
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 rounded-full border border-separator/70 bg-surface/60 px-2 py-1 text-sm text-foreground/80 hover:bg-surface transition-colors"
      >
        <current.Flag aria-hidden className="h-3.5 w-5 rounded-sm object-cover" />
        <span className="font-medium">{current.label}</span>
        <ChevronDownIcon className={clsx("w-3 h-3 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 mt-2 w-28 rounded-xl border border-separator bg-[#f5f0e8] dark:bg-background shadow-lg overflow-hidden z-50"
        >
          {MARKETS.map((m) => {
            const isCurrent = m.code === current.code;
            const inner = (
              <>
                <m.Flag aria-hidden className="h-3.5 w-5 rounded-sm object-cover" />
                <span className="flex-1 text-left">{m.label}</span>
                {isCurrent && <CheckIcon className="w-3.5 h-3.5 text-foreground/60" />}
              </>
            );
            const baseCls = "flex items-center gap-2 w-full px-2.5 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors";
            if (!m.enabled) {
              return (
                <div key={m.code} className={clsx(baseCls, "opacity-50 cursor-not-allowed")}>
                  <m.Flag aria-hidden className="h-3.5 w-5 rounded-sm object-cover" />
                  <span className="flex-1 text-left">{m.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-foreground/40">Soon</span>
                </div>
              );
            }
            if (m.href) {
              return (
                <a
                  key={m.code}
                  href={m.href}
                  className={baseCls}
                  onClick={() => setOpen(false)}
                >
                  {inner}
                </a>
              );
            }
            return (
              <Link
                key={m.code}
                to={m.route ?? "/"}
                className={baseCls}
                onClick={() => setOpen(false)}
              >
                {inner}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
