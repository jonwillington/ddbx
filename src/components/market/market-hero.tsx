/** Shared hero section. One templated headline above a layered atmospheric
 *  backdrop: bright warm spotlight at the headline, cool silver fall-off
 *  at the corners, slow-breathing pulse so the light reads as alive, and
 *  ambient orbs drifting around the sides. The bottom dissolves into the page
 *  colour without a hard rectangular band. All CSS-only; respects
 *  prefers-reduced-motion.
 *
 *  Layout: page is wrapped in `container max-w-7xl`, so the hero uses the
 *  `w-screen left-1/2 -translate-x-1/2` break-out trick to span the full
 *  viewport edge-to-edge. Fixed `min-h` keeps the hero the same height on
 *  every market — the optional beta notice is rendered absolutely at the
 *  top so it doesn't push the headline around, and slides in instead of
 *  popping when the user navigates to a beta market. */
import type { ReactNode } from "react";

export function MarketHero({
  marketLabel,
  topNotice,
}: {
  marketLabel: string;
  topNotice?: ReactNode;
}) {
  return (
    <header className="relative w-screen left-1/2 -translate-x-1/2 -mt-4 md:-mt-6 min-h-[300px] md:min-h-[380px] flex flex-col overflow-hidden animate-content-in">
      <style>{`
        @keyframes hero-notice-in {
          from { opacity: 0; transform: translate3d(-50%, -120%, 0); }
          to   { opacity: 1; transform: translate3d(-50%, 0, 0); }
        }
        .hero-notice {
          animation: hero-notice-in 480ms cubic-bezier(0.16, 0.84, 0.34, 1) both;
          will-change: opacity, transform;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-notice { animation: none !important; transform: translate(-50%, 0) !important; opacity: 1 !important; }
        }
        @keyframes hero-spotlight-breathe {
          0%, 100% { opacity: 0.85; transform: scale(1); }
          50%      { opacity: 1;    transform: scale(1.04); }
        }
        @keyframes hero-shimmer-drift {
          0%   { transform: translate3d(-6%, -3%, 0); }
          50%  { transform: translate3d( 6%,  3%, 0); }
          100% { transform: translate3d(-6%, -3%, 0); }
        }
        .hero-spotlight {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 55% 65% at 50% 32%,
              rgba(255, 248, 232, 0.85) 0%,
              rgba(255, 248, 232, 0.45) 25%,
              rgba(255, 248, 232, 0.12) 50%,
              transparent 70%);
          will-change: opacity, transform;
          animation: hero-spotlight-breathe 9s ease-in-out infinite;
        }
        .hero-shimmer {
          position: absolute; inset: -20% -10%;
          background:
            radial-gradient(ellipse 50% 50% at 18% 24%, rgba(206, 214, 228, 0.40) 0%, transparent 55%),
            radial-gradient(ellipse 45% 50% at 82% 18%, rgba(196, 206, 222, 0.32) 0%, transparent 55%),
            radial-gradient(ellipse 55% 40% at 35% 78%, rgba(214, 218, 226, 0.22) 0%, transparent 60%);
          will-change: transform;
          animation: hero-shimmer-drift 22s ease-in-out infinite;
        }
        .hero-warm-floor {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 110% 70% at 50% 60%,
              rgba(196, 168, 130, 0.10) 0%,
              transparent 65%);
        }
        .hero-vignette {
          position: absolute; inset: 0;
          background:
            radial-gradient(ellipse 90% 95% at 50% 40%,
              transparent 50%,
              rgba(120, 100, 80, 0.05) 80%,
              rgba(80, 65, 50, 0.10) 100%);
        }
        :is(.dark) .hero-spotlight {
          background:
            radial-gradient(ellipse 55% 65% at 50% 32%,
              rgba(196, 168, 130, 0.20) 0%,
              rgba(196, 168, 130, 0.10) 25%,
              rgba(196, 168, 130, 0.04) 50%,
              transparent 70%);
        }
        :is(.dark) .hero-shimmer {
          background:
            radial-gradient(ellipse 50% 50% at 18% 24%, rgba(130, 140, 160, 0.18) 0%, transparent 55%),
            radial-gradient(ellipse 45% 50% at 82% 18%, rgba(120, 130, 150, 0.14) 0%, transparent 55%),
            radial-gradient(ellipse 55% 40% at 35% 78%, rgba(140, 145, 160, 0.10) 0%, transparent 60%);
        }
        :is(.dark) .hero-warm-floor { display: none; }
        :is(.dark) .hero-vignette {
          background:
            radial-gradient(ellipse 90% 95% at 50% 40%,
              transparent 50%,
              rgba(0, 0, 0, 0.20) 80%,
              rgba(0, 0, 0, 0.35) 100%);
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-spotlight, .hero-shimmer { animation: none !important; }
        }
      `}</style>

      {/* Atmospheric backdrop — order matters. Warm floor sits behind so
          the shimmer + spotlight feel like they're cast on a surface; the
          vignette goes last so light falls off toward the corners. */}
      <div aria-hidden className="hero-warm-floor z-0" />
      <div aria-hidden className="hero-shimmer z-0" />
      <div aria-hidden className="hero-spotlight z-0" />
      <div aria-hidden className="hero-vignette z-[1] pointer-events-none" />

      {/* Top fade dissolves into the navbar; bottom fade passes through a
          slightly darker tone before resolving to the page colour so the
          table beneath reads as sitting *under* the lit stage. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 z-[6] bg-gradient-to-b from-[#f5f0e8] dark:from-background to-transparent" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 z-[6] dark:hidden"
        style={{
          background:
            "linear-gradient(to top, #f5f0e8 0%, rgba(245,240,232,0.94) 20%, rgba(245,240,232,0.58) 48%, rgba(245,240,232,0) 82%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-56 z-[6] hidden dark:block"
        style={{
          background:
            "linear-gradient(to top, var(--color-background, #15110d) 0%, rgba(21,17,13,0.85) 32%, rgba(21,17,13,0.4) 60%, transparent 100%)",
        }}
      />

      <style>{`
        .hero-orb { position: absolute; border-radius: 50%; will-change: opacity, transform; pointer-events: none; }
        .hero-orb-a { animation: ho-a 3.5s cubic-bezier(0.45,0.05,0.55,0.95) infinite; }
        .hero-orb-b { animation: ho-b 4.2s cubic-bezier(0.4,0,0.6,1) infinite; animation-delay: -1.2s; }
        .hero-orb-c { animation: ho-c 3.8s cubic-bezier(0.5,0,0.5,1) infinite; animation-delay: -2.4s; }
        .hero-orb-d { animation: ho-d 5s ease-in-out infinite; }
        .hero-orb-e { animation: ho-e 4.5s cubic-bezier(0.4,0.1,0.6,0.9) infinite; animation-delay: -3s; }
        .hero-dot  { position: absolute; border-radius: 50%; will-change: opacity, transform; pointer-events: none; }
        .hero-dot-a { animation: ho-dot 8s ease-in-out infinite; animation-delay: 0.3s; }
        .hero-dot-b { animation: ho-dot 8s ease-in-out infinite; animation-delay: 1.6s; }
        .hero-dot-c { animation: ho-dot 8s ease-in-out infinite; animation-delay: 3.65s; }
        .hero-glow { position: absolute; border-radius: 50%; will-change: opacity, transform; pointer-events: none; }
        .hero-glow-a { animation: ho-glow 8s ease-out infinite; animation-delay: 0.3s; }
        .hero-glow-b { animation: ho-glow 8s ease-out infinite; animation-delay: 1.6s; }
        .hero-glow-c { animation: ho-glow 8s ease-out infinite; animation-delay: 3.65s; }
        @keyframes ho-a {
          0%   { opacity: 0.08; transform: scale(0.8) translate(-5%,2%); }
          20%  { opacity: 0.55; transform: scale(1.15) translate(-2%,1%); }
          38%  { opacity: 0.38; transform: scale(1.05) translate(-1%,0.5%); }
          55%  { opacity: 0.08; transform: scale(0.85); }
          100% { opacity: 0.08; transform: scale(0.8) translate(-5%,2%); }
        }
        @keyframes ho-b {
          0%   { opacity: 0.06; transform: scale(0.85); }
          25%  { opacity: 0.48; transform: scale(1.2) translate(3%,-2%); }
          45%  { opacity: 0.32; transform: scale(1.08) translate(2%,-1%); }
          62%  { opacity: 0.06; transform: scale(0.88); }
          100% { opacity: 0.06; transform: scale(0.85); }
        }
        @keyframes ho-c {
          0%   { opacity: 0.06; transform: scale(0.9); }
          15%  { opacity: 0.42; transform: scale(1.15) translate(1%,4%); }
          32%  { opacity: 0.28; transform: scale(1.05) translate(0.5%,2%); }
          48%  { opacity: 0.06; transform: scale(0.88); }
          68%  { opacity: 0.22; transform: scale(1.04) translate(1%,1%); }
          82%  { opacity: 0.06; transform: scale(0.9); }
          100% { opacity: 0.06; transform: scale(0.9); }
        }
        @keyframes ho-d {
          0%   { opacity: 0.04; transform: scale(0.82); }
          28%  { opacity: 0.32; transform: scale(1.1) translate(-1%,-3%); }
          44%  { opacity: 0.06; transform: scale(0.86); }
          100% { opacity: 0.04; transform: scale(0.82); }
        }
        @keyframes ho-e {
          0%   { opacity: 0.05; transform: scale(0.75); }
          22%  { opacity: 0.38; transform: scale(1.15) translate(2%,-3%); }
          40%  { opacity: 0.22; transform: scale(1.06) translate(1%,-2%); }
          58%  { opacity: 0.05; transform: scale(0.78); }
          100% { opacity: 0.05; transform: scale(0.75); }
        }
        @keyframes ho-dot {
          0%   { opacity: 0;    transform: scale(0); }
          5%   { opacity: 0.7;  transform: scale(1.3); }
          8%   { opacity: 0.55; transform: scale(1.0); }
          16%  { opacity: 0;    transform: scale(0.6); }
          100% { opacity: 0;    transform: scale(0); }
        }
        @keyframes ho-glow {
          0%   { opacity: 0;    transform: scale(0); }
          5%   { opacity: 0.35; transform: scale(0.8); }
          14%  { opacity: 0;    transform: scale(2.5); }
          100% { opacity: 0;    transform: scale(0); }
        }
        .hero-line { fill: none; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; will-change: opacity, stroke-dashoffset; }
        .hero-line-a { animation: ho-line 18s ease-in-out infinite; animation-delay: 0.8s; stroke-dasharray: 300; }
        .hero-line-b { animation: ho-line 14s ease-in-out infinite; animation-delay: -5s; stroke-dasharray: 300; }
        .hero-line-c { animation: ho-line 11s ease-in-out infinite; animation-delay: -8s; stroke-dasharray: 200; }
        @keyframes ho-line {
          0%   { opacity: 0;    stroke-dashoffset: 300; }
          6%   { opacity: 0.11; stroke-dashoffset: 278; }
          70%  { opacity: 0.11; stroke-dashoffset: 0; }
          86%  { opacity: 0;    stroke-dashoffset: 0; }
          100% { opacity: 0;    stroke-dashoffset: 300; }
        }
        @media (prefers-reduced-motion: reduce) {
          .hero-orb, .hero-dot, .hero-glow, .hero-line { animation: none !important; }
          .hero-orb-a { opacity: 0.32; }
          .hero-orb-b { opacity: 0.24; }
          .hero-orb-c { opacity: 0.20; }
          .hero-orb-d { opacity: 0.16; }
          .hero-orb-e { opacity: 0.16; }
          .hero-line { opacity: 0; }
        }
      `}</style>

      {/* Left side panel — orbs anchored at the right edge so they drift
          out toward the gutter rather than into the headline. Overflow stays
          visible so gradients never reveal a clipped rectangular panel. */}
      <div
        aria-hidden
        className="hidden md:block absolute inset-y-0 left-0 w-[38%] overflow-visible z-0 pointer-events-none"
      >
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <polyline
            className="hero-line hero-line-a"
            points="0,56 12,51 22,47 32,53 44,45 56,41 68,44 80,37 92,33 100,30"
            stroke="#9a8878"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="hero-line hero-line-b"
            points="0,68 16,73 30,80 46,77 62,70 78,63 92,58 100,55"
            stroke="#b0a090"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="hero-orb hero-orb-a"
          style={{
            right: "-20%",
            top: "-30%",
            width: 320,
            height: 320,
            background:
              "radial-gradient(circle, #b8a898 0%, rgba(184,168,152,0) 70%)",
          }}
        />
        <div
          className="hero-orb hero-orb-c"
          style={{
            right: "10%",
            top: "30%",
            width: 260,
            height: 260,
            background:
              "radial-gradient(circle, #a89880 0%, rgba(168,152,128,0) 70%)",
          }}
        />
        <div
          className="hero-orb hero-orb-e"
          style={{
            right: "-10%",
            top: "0%",
            width: 240,
            height: 240,
            background:
              "radial-gradient(circle, transparent 46%, #b0a090 49%, #b0a090 51%, transparent 56%)",
          }}
        />
        <div
          className="hero-glow hero-glow-a"
          style={{
            right: "20%",
            top: "30%",
            width: 20,
            height: 20,
            border: "1px solid #8B6040",
            background: "transparent",
          }}
        />
        <div
          className="hero-dot  hero-dot-a"
          style={{
            right: "20%",
            top: "30%",
            width: 10,
            height: 10,
            background: "#8B6040",
            marginRight: 5,
            marginTop: 5,
          }}
        />
      </div>

      {/* Right side panel — mirror, anchored at the left edge. */}
      <div
        aria-hidden
        className="hidden md:block absolute inset-y-0 right-0 w-[38%] overflow-visible z-0 pointer-events-none"
      >
        <svg
          aria-hidden
          className="absolute inset-0 w-full h-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          <polyline
            className="hero-line hero-line-c"
            points="0,53 12,48 22,51 34,44 48,48 62,41 76,45 88,39 100,37"
            stroke="#8B7258"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          <polyline
            className="hero-line hero-line-b"
            points="0,30 14,33 28,30 44,27 58,25 74,22 88,20 100,18"
            stroke="#b0a090"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <div
          className="hero-orb hero-orb-b"
          style={{
            left: "-15%",
            top: "-25%",
            width: 280,
            height: 280,
            background:
              "radial-gradient(circle, #c4b5a5 0%, rgba(196,181,165,0) 70%)",
          }}
        />
        <div
          className="hero-orb hero-orb-d"
          style={{
            left: "20%",
            top: "25%",
            width: 360,
            height: 360,
            background:
              "radial-gradient(circle, transparent 47%, #9a8878 49%, #9a8878 51%, transparent 55%)",
          }}
        />
        <div
          className="hero-glow hero-glow-b"
          style={{
            left: "15%",
            top: "60%",
            width: 20,
            height: 20,
            border: "1px solid #8B6040",
            background: "transparent",
          }}
        />
        <div
          className="hero-dot  hero-dot-b"
          style={{
            left: "15%",
            top: "60%",
            width: 10,
            height: 10,
            background: "#8B6040",
            marginLeft: 5,
            marginTop: 5,
          }}
        />
        <div
          className="hero-glow hero-glow-c"
          style={{
            left: "45%",
            top: "20%",
            width: 20,
            height: 20,
            border: "1px solid #8B6040",
            background: "transparent",
          }}
        />
        <div
          className="hero-dot  hero-dot-c"
          style={{
            left: "45%",
            top: "20%",
            width: 10,
            height: 10,
            background: "#8B6040",
            marginLeft: 5,
            marginTop: 5,
          }}
        />
      </div>

      {/* Optional beta / advisory notice — absolutely positioned so it
          floats on top of the hero without changing its height. Slides
          down on mount so navigating into a beta market reads as a
          smooth banner drop rather than a layout flash. */}
      {topNotice && (
        <div
          key="topNotice"
          className="hero-notice absolute left-1/2 top-4 md:top-6 z-[7] inline-flex items-center gap-2 rounded-full border border-amber-300/40 bg-amber-100/85 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60 backdrop-blur-sm px-3.5 py-1 text-sm shadow-sm"
        >
          <span className="rounded-full bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:text-amber-200">
            Beta
          </span>
          {topNotice}
        </div>
      )}

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 py-10 md:py-16 text-center">
        <h2
          className="mx-auto text-balance text-3xl font-semibold tracking-tight leading-[1.05] md:text-[52px]"
          style={{ maxWidth: 550 }}
        >
          Which directors have been buying shares in{" "}
          <span className="text-[#6b5038] dark:text-[#c4a882]">
            {marketLabel}
          </span>{" "}
          companies?
        </h2>
      </div>
    </header>
  );
}
