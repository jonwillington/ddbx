/** Shared hero section. One templated headline + ambient orb / trend-line
 *  animation ported from the retired dashboard hero. Orbs are confined to
 *  side panels so they sit beside the headline, not behind it. Animations
 *  are CSS-only and respect prefers-reduced-motion. */
export function MarketHero({ marketLabel }: { marketLabel: string }) {
  return (
    <header className="relative -mx-4 md:-mx-6 overflow-hidden animate-content-in">
      {/* Top/bottom fades dissolve the orbs into the surrounding page */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-16 z-[5] bg-gradient-to-b from-[#f5f0e8] dark:from-background to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 z-[5] bg-gradient-to-t from-[#f5f0e8] dark:from-background to-transparent" />

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
          0%   { opacity: 0.03; transform: scale(0.8) translate(-5%,2%); }
          20%  { opacity: 0.22; transform: scale(1.15) translate(-2%,1%); }
          38%  { opacity: 0.16; transform: scale(1.05) translate(-1%,0.5%); }
          55%  { opacity: 0.03; transform: scale(0.85); }
          100% { opacity: 0.03; transform: scale(0.8) translate(-5%,2%); }
        }
        @keyframes ho-b {
          0%   { opacity: 0.02; transform: scale(0.85); }
          25%  { opacity: 0.18; transform: scale(1.2) translate(3%,-2%); }
          45%  { opacity: 0.12; transform: scale(1.08) translate(2%,-1%); }
          62%  { opacity: 0.02; transform: scale(0.88); }
          100% { opacity: 0.02; transform: scale(0.85); }
        }
        @keyframes ho-c {
          0%   { opacity: 0.02; transform: scale(0.9); }
          15%  { opacity: 0.16; transform: scale(1.15) translate(1%,4%); }
          32%  { opacity: 0.10; transform: scale(1.05) translate(0.5%,2%); }
          48%  { opacity: 0.02; transform: scale(0.88); }
          68%  { opacity: 0.08; transform: scale(1.04) translate(1%,1%); }
          82%  { opacity: 0.02; transform: scale(0.9); }
          100% { opacity: 0.02; transform: scale(0.9); }
        }
        @keyframes ho-d {
          0%   { opacity: 0.01; transform: scale(0.82); }
          28%  { opacity: 0.12; transform: scale(1.1) translate(-1%,-3%); }
          44%  { opacity: 0.02; transform: scale(0.86); }
          100% { opacity: 0.01; transform: scale(0.82); }
        }
        @keyframes ho-e {
          0%   { opacity: 0.02; transform: scale(0.75); }
          22%  { opacity: 0.14; transform: scale(1.15) translate(2%,-3%); }
          40%  { opacity: 0.08; transform: scale(1.06) translate(1%,-2%); }
          58%  { opacity: 0.02; transform: scale(0.78); }
          100% { opacity: 0.02; transform: scale(0.75); }
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
          .hero-orb-a { opacity: 0.12; }
          .hero-orb-b { opacity: 0.08; }
          .hero-orb-c { opacity: 0.06; }
          .hero-orb-d { opacity: 0.04; }
          .hero-orb-e { opacity: 0.04; }
          .hero-line { opacity: 0; }
        }
      `}</style>

      {/* Left side panel — orbs anchored at the right edge so they drift
          out toward the gutter rather than into the headline. */}
      <div
        aria-hidden
        className="hidden md:block absolute inset-y-0 left-0 w-[28%] overflow-hidden z-0 pointer-events-none"
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
        className="hidden md:block absolute inset-y-0 right-0 w-[28%] overflow-hidden z-0 pointer-events-none"
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

      <div className="relative z-10 py-10 md:py-16 px-4 text-center">
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
