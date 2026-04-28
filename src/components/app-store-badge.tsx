const APP_STORE_URL =
  "https://apps.apple.com/us/app/ddbx-uk/id6762196330?itscg=30200&itsct=apps_box_badge&mttnsubad=6762196330";

const BADGE_SRC =
  "https://toolbox.marketingtools.apple.com/api/v2/badges/download-on-the-app-store/black/en-us?releaseDate=1776643200";

const SIZES = {
  sm: { width: 85, height: 28 },
  md: { width: 120, height: 40 },
  lg: { width: 160, height: 53 },
} as const;

export function AppStoreBadge({
  size = "sm",
  className = "",
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const { width, height } = SIZES[size];

  return (
    <a
      aria-label="Download on the App Store"
      className={`inline-block opacity-80 hover:opacity-100 transition-opacity ${className}`}
      href={APP_STORE_URL}
      rel="noopener noreferrer"
      target="_blank"
    >
      <img
        alt="Download on the App Store"
        src={BADGE_SRC}
        style={{ width, height, verticalAlign: "middle", objectFit: "contain" }}
      />
    </a>
  );
}
