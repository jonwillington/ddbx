import { Navbar } from "@/components/navbar";

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col min-h-screen bg-[#f5f0e8] dark:bg-background">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-6 flex-grow pt-16">
        {children}
      </main>
      <footer className="w-full border-t border-divider bg-content1/40">
        <div className="container mx-auto max-w-7xl px-6 py-5 text-[10px] leading-4 text-foreground/40">
          <div className="flex items-center justify-between mb-4">
            <img src="/logo.svg" alt="ddbx" className="h-5 max-w-[56px] opacity-30 dark:invert" />
            <a
              href="https://x.com/ddbxuk"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-foreground/40 hover:text-foreground/70 transition-colors"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="w-3.5 h-3.5 fill-current shrink-0">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.742l7.736-8.861L1.254 2.25H8.08l4.257 5.625zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span>For live updates, follow us on X (Twitter)</span>
            </a>
          </div>
          <p>
            Disclaimer: The information, ratings, signals, commentary, and any
            related content provided on this website are for general
            informational and educational purposes only and are not intended to
            be financial advice, investment advice, tax advice, legal advice, or
            a recommendation to buy, sell, or hold any security or financial
            instrument.
          </p>
          <p className="mt-2">
            Nothing on this site constitutes personal advice or takes account of
            your individual objectives, financial situation, risk tolerance, or
            needs. You should always conduct your own research and, where
            appropriate, seek advice from a qualified and regulated financial
            professional before making any investment decision.
          </p>
          <p className="mt-2">
            Past performance, hypothetical performance, and model outputs are
            not reliable indicators of future results. Market conditions can
            change rapidly, data may be delayed or incomplete, and no guarantee
            is made as to the accuracy, completeness, or timeliness of any
            content provided.
          </p>
          <p className="mt-2">
            By using this website, you acknowledge that any reliance on the
            information is at your own risk and that the operators, authors, and
            contributors of this site are not liable for any direct, indirect,
            incidental, or consequential loss arising from use of, or reliance
            on, the content.
          </p>
          <p className="mt-2">
            This site is not an offer or solicitation in any jurisdiction where
            such offer or solicitation would be unlawful. Investing involves
            risk, including the possible loss of capital.
          </p>
        </div>
      </footer>
    </div>
  );
}
