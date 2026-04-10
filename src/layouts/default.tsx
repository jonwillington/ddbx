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
          <img src="/logo.svg" alt="ddbx" className="h-5 max-w-[56px] mb-4 opacity-30 dark:invert" />
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
