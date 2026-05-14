import { useEffect, useState } from "react";

/**
 * Logo.dev config. Free tier requires attribution via `LogoDevAttribution`
 * once per logo-bearing screen. Token is the same publishable key the iOS
 * app ships (safe in the client per logo.dev docs).
 */
const LOGO_DEV_TOKEN = "pk_aFXx8Wx5TrenY0XbJuUMrA";
const LOGO_DEV_ATTRIBUTION_URL = "https://logo.dev";

function logoUrl(ticker: string, sizePx: number): string {
  const stripped = ticker.replace(/\.L$/, "");
  // Oversample like iOS — keeps the request URL stable regardless of DPR
  // so cached responses re-use across @1x/@2x viewports.
  const pixelSize = Math.max(48, Math.round(sizePx * 3));
  return `https://img.logo.dev/ticker/${encodeURIComponent(stripped)}?token=${LOGO_DEV_TOKEN}&size=${pixelSize}&format=png&retina=true`;
}

function monogram(ticker: string): string {
  return ticker.replace(/\.L$/, "").slice(0, 3);
}

interface CompanyLogoProps {
  ticker: string;
  /** Rendered diameter in px. Defaults to 40. */
  size?: number;
  className?: string;
}

/**
 * Circular company logo for an LSE ticker via Logo.dev. Falls back to a
 * ticker monogram when the network image fails or fires nothing useful.
 * Mirrors `CompanyLogo` in the iOS app.
 */
export function CompanyLogo({ ticker, size = 40, className }: CompanyLogoProps) {
  const [failed, setFailed] = useState(false);
  const src = logoUrl(ticker, size);

  useEffect(() => { setFailed(false); }, [src]);

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden rounded-full border border-[#d0c8be]/50 dark:border-border/50 bg-[#f1ebe2] dark:bg-surface-secondary ${className ?? ""}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      {failed ? (
        <span
          className="font-mono font-semibold text-muted leading-none"
          style={{ fontSize: Math.max(9, Math.round(size * 0.32)) }}
        >
          {monogram(ticker)}
        </span>
      ) : (
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-contain"
        />
      )}
    </span>
  );
}

/**
 * Logo.dev's free tier requires a followable link back to logo.dev. Place
 * once per page that shows logos.
 */
export function LogoDevAttribution({ className }: { className?: string }) {
  return (
    <div className={`text-xs text-muted ${className ?? ""}`}>
      Logos provided by{" "}
      <a
        href={LOGO_DEV_ATTRIBUTION_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium hover:text-foreground transition-colors"
      >
        Logo.dev
      </a>
    </div>
  );
}
