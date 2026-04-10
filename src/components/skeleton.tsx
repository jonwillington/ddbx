interface SkeletonProps {
  className?: string;
  /** Pixel height — handy for one-off shapes that don't map to Tailwind sizes. */
  h?: number | string;
  /** Pixel width. */
  w?: number | string;
  /** Render as a circle (e.g. avatars, dots). */
  circle?: boolean;
}

export function Skeleton({ className = "", h, w, circle }: SkeletonProps) {
  const style: React.CSSProperties = {};
  if (h != null) style.height = typeof h === "number" ? `${h}px` : h;
  if (w != null) style.width = typeof w === "number" ? `${w}px` : w;
  if (circle) style.borderRadius = "9999px";
  return <div className={`skeleton ${className}`} style={style} aria-hidden />;
}
