// NetherlandsMarket — the AFM Register meldingen leidinggevenden plugin
// for <MarketPage />. Mounted at `/nl` via NetherlandsPreviewPage (route
// added by the consumer; this module is the registry payload).
//
// Wire format is EuDealing (MAR-harmonised) just like Sweden. Differences
// vs sweden.tsx are localised to: nature/role translation tables, EUR
// formatting, Euronext Amsterdam session + holidays, and the Signal
// filter (which additionally excludes non-Gewoon-aandeel instruments —
// AFM publishes restricted-share-rights and other derivative-flavoured
// rows alongside plain shares).
//
// Shared with sweden.tsx (intentionally for v1; lift to an `eu-shared.tsx`
// when a third market joins): the EuRowGroup interface and groupRows().
// Field component and fmtNativeMoney/fmtNativePrice helpers are
// re-declared here to keep this module self-contained until that lift —
// the user's registry refactor is the better moment for that extraction.

import type { HolidaySource } from "@/lib/bank-holidays";
import type { MarketSession } from "@/lib/market-status";
import {
  type EuRowGroup,
  groupRows,
} from "@/lib/markets/sweden";
import type {
  MarketConfig,
  MarketDealing,
  MarketStats,
  Tone,
} from "@/lib/markets/types";
import { api } from "@/lib/api";
import { PriceFormat } from "@/components/position-card";

/** Euronext Amsterdam — continuous trading 09:00–17:30 Europe/Amsterdam,
 *  closing call 17:30, official close 17:35. We use 17:30 to align with
 *  the data we surface (daily bars). Half-day closes (24 Dec, 31 Dec)
 *  unmodelled for v1. */
export const EURONEXT_AMSTERDAM: MarketSession = {
  timeZone: "Europe/Amsterdam",
  openMinute: 9 * 60,
  closeMinute: 17 * 60 + 30,
};

/** Dutch public holidays observed by Euronext Amsterdam — static map.
 *  Update when the year rolls over. Source: euronext.com/markets/calendar.
 *  Notable: Euronext Amsterdam IS closed on 1 May (Dag van de Arbeid).
 *  Half-day closes (24 Dec, 31 Dec) are not encoded — the row is treated
 *  as a full trading day; refine when the price-history wiring lands. */
export const NL_EXCHANGE_HOLIDAYS: HolidaySource = {
  kind: "static",
  map: {
    "2026-01-01": "Nieuwjaarsdag",
    "2026-04-03": "Goede Vrijdag",
    "2026-04-06": "Tweede Paasdag",
    "2026-05-01": "Dag van de Arbeid",
    "2026-12-25": "Eerste Kerstdag",
    "2026-12-26": "Tweede Kerstdag",
    "2027-01-01": "Nieuwjaarsdag",
    "2027-03-26": "Goede Vrijdag",
    "2027-03-29": "Tweede Paasdag",
    "2027-12-24": "Kerstavond (halve dag — niet gemodelleerd)",
    "2027-12-27": "Tweede Kerstdag (waarn.)",
  },
};

/** EUR formatter bundle. Dutch shares trade in decimal euros; values are
 *  already in major units (EUR). Cross-listed issuers occasionally file
 *  in USD/GBP — those render with the foreign-currency symbol in detail
 *  views; list views round to EUR-style formatting. */
const EUR_FORMAT: PriceFormat = {
  formatPrice: (n) =>
    new Intl.NumberFormat("nl-NL", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 2,
    }).format(n),
  formatValue: (n) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: 0,
    }).format(n),
  quoteToValue: 1,
  valueColumnClass: "w-32",
};

/* ─── Dutch → English translation ────────────────────────────────────── */

/** AFM publishes a closed set of `nature` strings (transaction category)
 *  derived from the MAR Annex template. Lowercase prefix match — AFM
 *  sometimes suffixes the category with a transaction_type qualifier
 *  (e.g. "Verwerving – Omwisseling van soort effect" elsewhere in the
 *  payload). We surface only the category in the row chip and let the
 *  detail body show the type. Ordered longest-prefix-first. */
const NATURE_MAP: Array<{ prefix: string; label: string; tone: Tone }> = [
  { prefix: "verwerving", label: "Acquisition", tone: "buy" },
  { prefix: "vervreemding", label: "Disposal", tone: "sell" },
  { prefix: "inschrijving", label: "Subscription", tone: "buy" },
  { prefix: "schenking", label: "Gift", tone: "neutral" },
  { prefix: "erfenis", label: "Inheritance", tone: "neutral" },
  { prefix: "uitgifte", label: "Issuance", tone: "neutral" },
  { prefix: "overdracht", label: "Transfer", tone: "neutral" },
  { prefix: "inkoop", label: "Buy-back", tone: "neutral" },
  { prefix: "tilbageköp", label: "Buy-back", tone: "neutral" },
  { prefix: "ruil", label: "Exchange", tone: "neutral" },
  { prefix: "uitoefening", label: "Exercise", tone: "exercise" },
  { prefix: "pandrecht", label: "Pledge", tone: "neutral" },
  { prefix: "lening", label: "Loan", tone: "neutral" },
];

function normaliseDutch(s: string): string {
  return s.replace(/ /g, " ").trim().toLowerCase();
}

function translateNature(nature: string): { label: string; tone: Tone } {
  const n = normaliseDutch(nature);

  for (const entry of NATURE_MAP) {
    if (n.startsWith(entry.prefix))
      return { label: entry.label, tone: entry.tone };
  }

  return { label: nature || "—", tone: "neutral" };
}

/** AFM's `functie` column is mixed Dutch / English, depending on whether
 *  the issuer reports via the one-tier-board English template (Aegon,
 *  Unilever, Ferrovial) or the two-tier Dutch governance vocabulary
 *  (RvB / RvC for most NL-domestic issuers). Translate Dutch terms,
 *  pass through English ones verbatim. Case-insensitive lookup. */
const ROLE_MAP: Record<string, string> = {
  // Dutch two-tier: Raad van Bestuur (management board)
  "lid van de raad van bestuur": "Board member",
  "lid raad van bestuur": "Board member",
  "voorzitter raad van bestuur": "Board chair (CEO)",
  "voorzitter van de raad van bestuur": "Board chair (CEO)",
  bestuurder: "Director",
  "uitvoerend bestuurder": "Executive director",
  "niet-uitvoerend bestuurder": "Non-executive director",
  // Dutch two-tier: Raad van Commissarissen (supervisory board)
  "lid van de raad van commissarissen": "Supervisory board member",
  "lid raad van commissarissen": "Supervisory board member",
  "voorzitter raad van commissarissen": "Supervisory chair",
  "voorzitter van de raad van commissarissen": "Supervisory chair",
  commissaris: "Supervisory board member",
  // Exec titles (some issuers file these directly)
  ceo: "CEO",
  "chief executive officer": "CEO",
  cfo: "CFO",
  "chief financial officer": "CFO",
  "chief financnial officer": "CFO", // sic — observed AFM typo on MPC filings
  coo: "COO",
  "chief operating officer": "COO",
  cio: "CIO",
  "chief information officer": "CIO",
  "general counsel": "General counsel",
  // One-tier-board English (Aegon Ltd, Unilever Plc)
  "member board of directors": "Board member",
  "chair board of directors": "Board chair",
  "director sales": "Sales director",
  // Family / closely-associated catch-all
  "naaste verwant": "Close relation",
  echtgenoot: "Spouse",
  echtgenote: "Spouse",
};

function translateRole(role: string | undefined): string | undefined {
  if (!role) return undefined;
  const direct = ROLE_MAP[normaliseDutch(role)];

  if (direct) return direct;
  // AFM occasionally comma-joins multiple roles ("CEO, Member Board of
  // Directors"). Try whole string first; only split if no direct match.
  const parts = role
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length === 0) return undefined;
  const mapped = parts.map((p) => ROLE_MAP[normaliseDutch(p)] ?? p);

  return mapped.join(" · ");
}

/* ─── Wire → MarketDealing normalization ─────────────────────────────── */

/** Direct PDMR acquisitions of plain shares outside any share programme.
 *  Stricter than Sweden's because AFM publishes a wider mix of
 *  instrument types (Restricted shares, Restricted share rights, Opties)
 *  alongside Gewoon aandeel — for Signal we want common-share buys only.
 *  Mirrors SwedenMarket.isCleanBuyGroup in shape so the shell row-mute
 *  logic stays uniform. */
function isCleanBuyGroup(g: EuRowGroup): boolean {
  const d = g.primary;
  const t = translateNature(d.nature).tone;

  if (t !== "buy") return false;
  if (d.reporter.is_closely_associated) return false;
  if (d.is_share_programme) return false;
  if (d.is_amendment) return false;
  // AFM-specific: filter out derivative/restricted instrument types.
  // "Gewoon aandeel" = common share. Anything else (Restricted share
  // rights, Opties, Converteerbare obligaties) is downstream of a
  // grant, not an open-market conviction buy.
  const itype = (d.instrument_type || "").toLowerCase();

  if (!itype.startsWith("gewoon")) return false;

  return true;
}

export function toMarketDealing(g: EuRowGroup): MarketDealing<EuRowGroup> {
  const d = g.primary;
  const action = translateNature(d.nature);
  const suffix = d.reporter.is_closely_associated ? " (PCA)" : "";

  return {
    key: g.key,
    id: d.id,
    // AFM ISINs resolve to .AS Yahoo tickers via the same isin_tickers
    // cache as Sweden. Empty fallback keeps MarketRow's "—" treatment.
    ticker: d.ticker ?? "",
    company: d.company,
    insiderName: d.reporter.name,
    insiderRole: translateRole(d.reporter.role),
    disclosedDate: g.disclosed_date,
    tradeDate: g.trade_date,
    isPurchase: isCleanBuyGroup(g),
    value: g.total_value,
    entryPrice: g.weighted_price,
    shares: g.total_shares,
    legCount: g.leg_count,
    actionLabel: action.label + suffix,
    actionTone: action.tone,
    raw: g,
  };
}

/* ─── Slot: RowActionCell (flag chips for AFM-specific signals) ──────── */

const CHIP_BASE =
  "inline-flex items-center justify-center rounded-md border whitespace-nowrap px-2 py-0.5 text-[11px]";

const CHIP_TONES: Record<"weak" | "neutral", string> = {
  weak: "bg-amber-200/15 text-amber-900/70 border-amber-400/25 dark:text-amber-200/60 dark:border-amber-300/20",
  neutral:
    "bg-transparent text-[#b0a898] border-[#d8d0c6]/60 dark:text-foreground/45",
};

function NetherlandsRowActionCell({
  dealing,
}: {
  dealing: MarketDealing<EuRowGroup>;
}) {
  const d = dealing.raw.primary;
  const chips: Array<{ label: string; tone: "weak" | "neutral" }> = [];

  if (d.reporter.is_closely_associated)
    chips.push({ label: "PCA", tone: "weak" });
  if (d.is_share_programme) chips.push({ label: "Programme", tone: "weak" });
  // AFM-specific: surface non-common-share instruments so users
  // understand why a row didn't make Signal.
  const itype = (d.instrument_type || "").toLowerCase();

  if (itype && !itype.startsWith("gewoon")) {
    chips.push({ label: "Derivative", tone: "weak" });
  }
  if (d.is_amendment) chips.push({ label: "Amendment", tone: "neutral" });
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1 justify-center">
      {chips.map((c) => (
        <span key={c.label} className={`${CHIP_BASE} ${CHIP_TONES[c.tone]}`}>
          {c.label}
        </span>
      ))}
    </div>
  );
}

/* ─── Slot: DetailBody ───────────────────────────────────────────────── */

function fmtNativeMoney(n: number | null, ccy: string): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: ccy || "EUR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${ccy} ${Math.round(n).toLocaleString("en-GB")}`;
  }
}

function fmtNativePrice(n: number | null, ccy: string): string {
  if (n == null) return "—";
  const num = new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 2,
  }).format(n);

  return `${num} ${ccy}`;
}

function NetherlandsDetailBody({
  dealing,
}: {
  dealing: MarketDealing<EuRowGroup>;
}) {
  const g = dealing.raw;
  const d = g.primary;
  const action = translateNature(d.nature);
  const flags: Array<{ label: string; tone: "weak" | "neutral" }> = [];

  if (d.reporter.is_closely_associated)
    flags.push({ label: "PCA filing", tone: "weak" });
  if (d.is_share_programme)
    flags.push({ label: "Share programme", tone: "weak" });
  if (d.is_amendment) flags.push({ label: "Amendment", tone: "neutral" });
  const multiLeg = g.leg_count > 1;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
        <Field label="Insider" value={d.reporter.name} />
        <Field label="Role" value={translateRole(d.reporter.role) ?? "—"} />
        <Field label="Action" value={action.label} />
        <Field
          label={multiLeg ? "Total value" : "Value"}
          value={fmtNativeMoney(g.total_value, d.currency)}
        />
        <Field
          label={multiLeg ? "Total shares" : "Shares"}
          value={g.total_shares.toLocaleString("en-GB")}
        />
        <Field
          label={multiLeg ? "VWAP" : "Price"}
          value={fmtNativePrice(g.weighted_price, d.currency)}
        />
      </dl>

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <span
              key={f.label}
              className={`${CHIP_BASE} ${CHIP_TONES[f.tone]}`}
            >
              {f.label}
            </span>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
        <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
          Instrument
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Field label="Type" value={d.instrument_type || "—"} />
          <Field mono label="ISIN" value={d.isin || "—"} />
          <Field mono label="LEI" value={d.lei} />
          {d.venue && <Field label="Venue" value={d.venue} />}
          <Field label="Currency" value={d.currency || "—"} />
        </div>
      </div>

      {multiLeg && (
        <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
            Fills ({g.leg_count})
          </div>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="text-left font-normal pb-1">Trade date</th>
                <th className="text-right font-normal pb-1">Shares</th>
                <th className="text-right font-normal pb-1">Price</th>
                <th className="text-right font-normal pb-1">Value</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {g.legs.map((leg) => (
                <tr
                  key={leg.id}
                  className="border-t border-black/[0.04] dark:border-white/[0.06]"
                >
                  <td className="py-1">{leg.trade_date.slice(0, 10)}</td>
                  <td className="py-1 text-right">
                    {leg.volume.toLocaleString("en-GB")}
                  </td>
                  <td className="py-1 text-right">
                    {fmtNativePrice(leg.price, leg.currency)}
                  </td>
                  <td className="py-1 text-right">
                    {fmtNativeMoney(
                      leg.price != null ? leg.price * leg.volume : null,
                      leg.currency,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {d.reporter.filing_entity &&
        d.reporter.filing_entity !== d.reporter.name && (
          <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3 text-sm">
            <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-1">
              Closely associated with
            </div>
            <div className="text-foreground/85">{d.reporter.filing_entity}</div>
            <div className="text-xs text-muted mt-1">
              (AFM: nauwgelieerdaan — the PDMR on whose behalf this filing was
              made)
            </div>
          </div>
        )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground transition-colors">
          Raw filing (Dutch source fields)
        </summary>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <Field label="Nature (raw)" value={d.nature} />
          <Field label="Role (raw)" value={d.reporter.role} />
          <Field label="Instrument (raw)" value={d.instrument_type} />
          <Field mono label="Disclosed" value={d.disclosed_date} />
          <Field mono label="Trade date" value={d.trade_date} />
          <Field mono label="ID" value={d.id} />
        </dl>
        <pre className="mt-3 overflow-x-auto rounded bg-black/85 dark:bg-black/60 p-3 text-[11px] text-slate-100 leading-snug">
          {JSON.stringify(d, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">
        {label}
      </dt>
      <dd className={`text-sm font-medium truncate ${mono ? "font-mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}

/* ─── MarketConfig ───────────────────────────────────────────────────── */

export const NetherlandsMarket: MarketConfig<EuRowGroup> = {
  id: "nl",
  title: "Netherlands director dealings (preview)",
  documentTitle: "ddbx · Director Dealings — Dutch PDMR Disclosures",
  session: EURONEXT_AMSTERDAM,
  holidays: NL_EXCHANGE_HOLIDAYS,
  description: (
    <>
      AFM <em>Register meldingen leidinggevenden MAR 19</em> — the Dutch MAR
      Article 19 register of trades by PDMRs (Persons Discharging Managerial
      Responsibilities) and their close associates. Hourly ingest from AFM;
      Haiku triage runs on the candidate pool.{" "}
      <strong className="text-foreground/75">Signal</strong> = direct PDMR
      acquisitions of common shares (Gewoon aandeel) outside any share
      programme. <strong className="text-foreground/75">All filings</strong>{" "}
      includes disposals, derivatives (Restricted share rights, Opties), and
      closely-associated (PCA) filings.
    </>
  ),
  marketLabel: "Dutch",
  locale: "en-GB",
  topNotice: "Dutch dealings are in BETA.",
  priceFormat: EUR_FORMAT,
  // EUR price column matches the EuDealing wire format; no normalization.
  // Yahoo .AS lookups are currently blocked from CF Worker IPs (same
  // posture as .ST). The /api/prices/* endpoints will return empty until
  // we wire an external price-ingest path for Amsterdam — sparklines /
  // detail charts will render placeholders. SE shipped this way too.
  normalizeLivePrice: (close) => close,
  // AEX index on Yahoo. Same Yahoo-from-CF block applies; the benchmark
  // chart will not populate from the worker side until the price-ingest
  // workaround lands. Leaving the symbol set so it lights up the moment
  // we get a price source.
  benchmarkTicker: "^AEX",
  benchmarkLabel: "AEX",
  formatTickerDisplay: (ticker) => ticker,
  isRowMuted: (d) => !d.isPurchase,
  enableLivePrices: true,
  // logo.dev coverage on Euronext Amsterdam is mid (ASML, ING, AKZA,
  // HEIA resolve cleanly; smaller AMX / AScX names return placeholders).
  // Leaving off until either a Euronext logo source or vendor logos.
  enableLogos: false,
  views: [
    { id: "signal", label: "Signal" },
    { id: "all", label: "All filings" },
  ],
  defaultView: "signal",
  pollIntervalMs: 60_000,
  async fetchDealings({ view }) {
    const r = await api.euDealings({ market: "NL", limit: 500 });
    const groups = groupRows(r.dealings);
    const signal = groups.filter(isCleanBuyGroup);
    const selected = view === "signal" ? signal : groups;
    const stats: MarketStats = {
      total: groups.length,
      viewCounts: {
        signal: signal.length,
        all: groups.length,
      },
      latestDisclosedLabel: r.stats.latest_disclosed_date
        ? `Latest disclosure ${r.stats.latest_disclosed_date.slice(0, 10)}`
        : undefined,
      debugBreakdown:
        r.dealings.length !== groups.length
          ? `${r.dealings.length} raw legs collapsed into ${groups.length} filings`
          : undefined,
    };

    return { dealings: selected.map(toMarketDealing), stats };
  },
  RowActionCell: NetherlandsRowActionCell,
  DetailBody: NetherlandsDetailBody,
  // Dutch business-press feeds (NOS Economie, NRC Economie, Volkskrant
  // Economie, NU.nl Economie). Worker pipeline: pipeline/nl-news.ts.
  fetchNews: () => api.nlNews(),
  newsHeading: "Dutch market news",
  newsFooterNote:
    "Third-party headlines (NOS Economie, NRC Economie, Volkskrant Economie, NU.nl Economie); opens in a new tab.",
  // No useGating — Netherlands ships unmoderated like Sweden until you
  // decide whether to gate NL behind the iOS app.
  renderEmptyState: ({ view, stats, setView }) => {
    const total = stats?.total ?? 0;
    const all = stats?.viewCounts.all ?? 0;

    if (view === "signal") {
      return (
        <>
          No direct PDMR buys in the latest scan.{" "}
          <button
            className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
            onClick={() => setView("all")}
          >
            Show all {all} filings
          </button>
        </>
      );
    }

    return (
      <>
        No Dutch dealings stored yet. The hourly cron fills this at :20 past
        each hour ({total} total today).
      </>
    );
  },
};
