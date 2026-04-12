import { useCallback, useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { XMarkIcon } from "@heroicons/react/24/outline";

type LegalPage = "privacy" | "cookies" | "terms" | null;

const LEGAL_LINKS: { label: string; page: LegalPage }[] = [
  { label: "Privacy Policy", page: "privacy" },
  { label: "Cookie Policy", page: "cookies" },
  { label: "Terms & Conditions", page: "terms" },
];

function LegalDrawer({ page, onClose }: { page: LegalPage; onClose: () => void }) {
  const open = page !== null;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Lock body scroll while open
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={onClose}
      />
      {/* Drawer panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-[#f5f0e8] dark:bg-background shadow-2xl transition-transform duration-300 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-6 py-5 border-b border-separator">
          <h2 className="text-lg font-semibold">
            {page === "privacy" && "Privacy Policy"}
            {page === "cookies" && "Cookie Policy"}
            {page === "terms" && "Terms & Conditions"}
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto h-[calc(100%-65px)] px-6 py-6 text-sm leading-relaxed text-foreground/70 space-y-4">
          {page === "privacy" && <PrivacyContent />}
          {page === "cookies" && <CookieContent />}
          {page === "terms" && <TermsContent />}
        </div>
      </div>
    </>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold text-foreground/90 mt-6 mb-2">{children}</h3>;
}

function PrivacyContent() {
  return (
    <>
      <p>Last updated: 1 April 2026</p>
      <p>
        DDBX (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the website ddbx.uk. This
        Privacy Policy explains how we collect, use, and protect information when you visit our site.
      </p>

      <SectionTitle>Information we collect</SectionTitle>
      <p>
        We collect minimal personal data. When you browse the site, our hosting provider
        (Cloudflare) may automatically log standard request metadata including your IP address,
        browser type, referring page, and pages visited. We do not require account registration
        and do not collect names, email addresses, or payment information.
      </p>

      <SectionTitle>How we use information</SectionTitle>
      <p>
        Any information collected is used solely for operating and improving the site, monitoring
        for abuse or technical issues, and understanding aggregate usage patterns. We do not sell,
        rent, or share personal data with third parties for marketing purposes.
      </p>

      <SectionTitle>Data storage and security</SectionTitle>
      <p>
        Data is processed and stored via Cloudflare&apos;s global network infrastructure. We employ
        reasonable technical measures to protect data against unauthorised access, but no method of
        electronic transmission or storage is completely secure.
      </p>

      <SectionTitle>Third-party services</SectionTitle>
      <p>
        The site is hosted on Cloudflare Pages and uses Cloudflare Workers for API functionality.
        Cloudflare&apos;s own privacy policy governs their processing of network-level data. We do
        not integrate third-party advertising, analytics, or social media tracking scripts.
      </p>

      <SectionTitle>Your rights</SectionTitle>
      <p>
        Under the UK GDPR, you have the right to access, correct, or request deletion of any
        personal data we hold. Since we collect minimal data and do not maintain user accounts,
        most requests can be addressed by clearing your browser cookies. For any data-related
        enquiries, please contact us via X (Twitter) @ddbxuk.
      </p>

      <SectionTitle>Changes to this policy</SectionTitle>
      <p>
        We may update this policy from time to time. Material changes will be noted on this page
        with a revised &quot;last updated&quot; date.
      </p>
    </>
  );
}

function CookieContent() {
  return (
    <>
      <p>Last updated: 1 April 2026</p>
      <p>
        This Cookie Policy explains how DDBX uses cookies and similar technologies when you visit
        ddbx.uk.
      </p>

      <SectionTitle>What are cookies?</SectionTitle>
      <p>
        Cookies are small text files placed on your device by websites you visit. They are widely
        used to make websites work efficiently and to provide information to site operators.
      </p>

      <SectionTitle>Cookies we use</SectionTitle>
      <p>
        We use only essential cookies required for the site to function correctly. These include:
      </p>
      <ul className="list-disc pl-5 space-y-1">
        <li>
          <strong>Cloudflare security cookies</strong> — used to identify trusted web traffic and
          protect against malicious visitors. These are set automatically by our hosting provider
          and cannot be disabled without affecting site functionality.
        </li>
        <li>
          <strong>Theme preference</strong> — a local storage entry that remembers whether you have
          selected light or dark mode, so your choice persists between visits.
        </li>
      </ul>

      <SectionTitle>Cookies we do not use</SectionTitle>
      <p>
        We do not use analytics cookies, advertising cookies, social media tracking pixels, or any
        form of cross-site tracking. We do not participate in advertising networks or share cookie
        data with third parties.
      </p>

      <SectionTitle>Managing cookies</SectionTitle>
      <p>
        You can control and delete cookies through your browser settings. Blocking essential
        cookies may affect site functionality. Since we do not use optional tracking cookies,
        there is no cookie consent banner — only strictly necessary cookies are set.
      </p>

      <SectionTitle>Changes to this policy</SectionTitle>
      <p>
        If we introduce new categories of cookies in the future, we will update this page and, if
        required, implement a consent mechanism before setting non-essential cookies.
      </p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p>Last updated: 1 April 2026</p>
      <p>
        By accessing and using ddbx.uk (&quot;the Site&quot;), you agree to be bound by these
        Terms &amp; Conditions. If you do not agree, please do not use the Site.
      </p>

      <SectionTitle>Nature of the service</SectionTitle>
      <p>
        The Site provides AI-generated analysis and ratings of UK director share dealings, sourced
        from publicly available regulatory disclosures. All content is produced by automated
        systems and is provided for informational and educational purposes only.
      </p>

      <SectionTitle>Not financial advice</SectionTitle>
      <p>
        Nothing on this Site constitutes personal financial advice, a recommendation to buy or sell
        any security, or an invitation to invest. Ratings, signals, and commentary are generated by
        AI models and may contain errors, omissions, or outdated information. You should always
        conduct your own research and seek independent professional advice before making any
        investment decision.
      </p>

      <SectionTitle>No warranty</SectionTitle>
      <p>
        The Site and its contents are provided on an &quot;as is&quot; and &quot;as available&quot;
        basis without warranties of any kind, whether express or implied. We do not guarantee the
        accuracy, completeness, reliability, or timeliness of any information displayed. Data may
        be delayed, incomplete, or contain errors introduced during automated processing.
      </p>

      <SectionTitle>Limitation of liability</SectionTitle>
      <p>
        To the fullest extent permitted by law, DDBX and its operators shall not be liable for any
        direct, indirect, incidental, special, or consequential damages arising from your use of,
        or inability to use, the Site or any reliance on its contents. This includes, without
        limitation, any losses from investment decisions made with reference to information on the
        Site.
      </p>

      <SectionTitle>Intellectual property</SectionTitle>
      <p>
        All original content, design, and code on the Site are the property of DDBX. Director
        dealing data is sourced from public regulatory filings. You may not reproduce, distribute,
        or create derivative works from the Site&apos;s content without prior written permission,
        except for personal, non-commercial use.
      </p>

      <SectionTitle>Availability</SectionTitle>
      <p>
        We aim to keep the Site available continuously but do not guarantee uninterrupted access.
        The Site may be temporarily unavailable due to maintenance, updates, or circumstances
        beyond our control.
      </p>

      <SectionTitle>Governing law</SectionTitle>
      <p>
        These terms are governed by the laws of England and Wales. Any disputes shall be subject
        to the exclusive jurisdiction of the courts of England and Wales.
      </p>

      <SectionTitle>Changes to these terms</SectionTitle>
      <p>
        We reserve the right to modify these terms at any time. Continued use of the Site after
        changes are posted constitutes acceptance of the revised terms.
      </p>
    </>
  );
}

export default function DefaultLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [legalPage, setLegalPage] = useState<LegalPage>(null);
  const closeLegal = useCallback(() => setLegalPage(null), []);

  return (
    <div className="relative flex flex-col min-h-screen bg-[#f5f0e8] dark:bg-background">
      <Navbar />
      <main className="container mx-auto max-w-7xl px-6 flex-grow pt-16">
        {children}
      </main>
      <footer className="w-full border-t border-separator bg-surface/60">
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
          {/* Legal links */}
          <div className="flex gap-4 mt-4 pt-3 border-t border-separator/50">
            {LEGAL_LINKS.map(({ label, page }) => (
              <button
                key={page}
                className="text-foreground/40 hover:text-foreground/70 transition-colors underline underline-offset-2"
                onClick={() => setLegalPage(page)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </footer>

      <LegalDrawer page={legalPage} onClose={closeLegal} />
    </div>
  );
}
