import type { ComponentType } from "react";
import type { GatingInfo, MarketDealing } from "@/lib/markets/types";
import type { PriceFormat } from "@/components/position-card";

import { useCallback, useEffect, useRef, useState } from "react";

import { CompanyLogo } from "@/components/company-logo";
import { RatingBadge } from "@/components/rating-badge";

/** Right-hand modal drawer used by every market. Shell-owned: backdrop,
 *  slide-from-right, escape-to-close, body-scroll lock, scroll-shadow on
 *  the header. The DetailBody slot fills in market-specific structure
 *  (Form 4 footnotes, RNS director history, …). */
export function MarketDetailDrawer<W>({
  dealing,
  onClose,
  fmt,
  DetailBody,
  DetailPosition,
  gating,
  DummyDetailBody,
  AnalysisOverlay,
  showLogo = true,
  formatTickerDisplay,
}: {
  dealing: MarketDealing<W> | null;
  onClose: () => void;
  fmt: PriceFormat;
  DetailBody: ComponentType<{ dealing: MarketDealing<W> }>;
  DetailPosition?: ComponentType<{ dealing: MarketDealing<W> }>;
  /** Optional gating state — when set, the drawer records a view on open
   *  and may swap to the dummy body + overlay. */
  gating?: GatingInfo;
  DummyDetailBody?: ComponentType<{ dealing: MarketDealing<W> }>;
  AnalysisOverlay?: ComponentType;
  /** Mirror of the row prop — when false, the header + body logo bubbles
   *  are suppressed. Wired from MarketConfig.enableLogos. Default true. */
  showLogo?: boolean;
  /** Human-readable ticker formatter from MarketConfig. */
  formatTickerDisplay?: (ticker: string) => string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const open = !!dealing;

  useEffect(() => {
    if (!dealing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKey);

    return () => window.removeEventListener("keydown", onKey);
  }, [dealing, onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";

    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;

    if (!el) return;
    setScrolled(el.scrollTop > 56);
  }, []);

  useEffect(() => {
    setScrolled(false);
    const el = scrollRef.current;

    if (el) el.scrollTop = 0;
  }, [dealing?.key]);

  // Record the view on every drawer open. recordView is idempotent per
  // dealId so re-renders during the same view don't matter; the first
  // open of the day becomes the "freebie" and subsequent ones get gated.
  useEffect(() => {
    if (!dealing || !gating?.enabled) return;
    gating.recordView(dealing.id);
  }, [dealing, gating]);

  const gated =
    gating?.enabled === true && !!dealing && !gating.hasFullAccess(dealing.id);
  const BodyComponent = gated && DummyDetailBody ? DummyDetailBody : DetailBody;

  const rawTicker = dealing?.ticker || "—";
  const ticker = formatTickerDisplay ? formatTickerDisplay(rawTicker) : rawTicker;
  const company = dealing?.company || "—";
  const insiderLine = dealing
    ? dealing.insiderRole
      ? `${dealing.insiderName} (${dealing.insiderRole})`
      : dealing.insiderName
    : "";
  const valueLabel =
    dealing && dealing.value != null ? fmt.formatValue(dealing.value) : "—";

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed top-0 right-0 h-full w-full max-w-2xl bg-background border-l border-black/10 dark:border-white/10 z-50
          shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-200
          ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        {dealing && (
          <>
            <div
              className={`shrink-0 flex items-center gap-3 px-5 md:px-8 py-4 border-b transition-all duration-200
                ${
                  scrolled
                    ? "border-black/10 dark:border-white/10 shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)]"
                    : "border-transparent"
                }`}
            >
              {showLogo && <CompanyLogo size={32} ticker={rawTicker} />}
              <span className="font-mono text-xs bg-black/5 dark:bg-white/5 px-1.5 py-0.5 rounded shrink-0">
                {ticker}
              </span>
              {dealing.rating && (
                <RatingBadge className="shrink-0" rating={dealing.rating} />
              )}
              <span
                className={`font-semibold text-sm truncate flex-1 min-w-0 transition-opacity duration-200
                  ${scrolled ? "opacity-100" : "opacity-0"}`}
              >
                {company}
              </span>
              <button
                aria-label="Close"
                className="shrink-0 text-muted hover:text-foreground text-2xl leading-none px-1"
                onClick={onClose}
              >
                ×
              </button>
            </div>

            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto"
              onScroll={handleScroll}
            >
              <div className="p-5 md:p-8 space-y-6">
                <div className="flex items-center gap-4">
                  {showLogo && <CompanyLogo size={56} ticker={rawTicker} />}
                  <h1 className="text-3xl font-bold leading-tight tracking-tight flex-1 min-w-0">
                    {company}
                  </h1>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Insider
                    </dt>
                    <dd className="text-sm font-medium truncate">
                      {insiderLine}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Action
                    </dt>
                    <dd className="text-sm font-medium">
                      {dealing.actionLabel}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
                      Amount
                    </dt>
                    <dd className="text-sm font-medium">{valueLabel}</dd>
                  </div>
                </dl>

                {DetailPosition && <DetailPosition dealing={dealing} />}
                {gated ? (
                  <div className="relative">
                    <div
                      aria-hidden
                      className="pointer-events-none select-none"
                      style={{ filter: "blur(4px)" }}
                    >
                      <BodyComponent dealing={dealing} />
                    </div>
                    {AnalysisOverlay && <AnalysisOverlay />}
                  </div>
                ) : (
                  <BodyComponent dealing={dealing} />
                )}
              </div>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
