// SwedenMarket — the FI Insynsregister plugin for <MarketPage />. Mounted at
// `/se` via SwedenPreviewPage. Wire format is EuDealing (MAR-harmonised),
// designed to scale to NL/DE/FR later when those NCAs come online.
//
// v1 has no triage / analysis layer — rows land straight from the hourly :20
// cron in ddbx-data. The Signal view is a pure filter (direct PDMR acquisition,
// not closely-associated, not share-programme) so we still surface a meaningful
// shortlist without LLM enrichment.
//
// Localised CSV fields (nature, role) are mapped to English at the edge here.
// Person and company names stay in Swedish with their diacritics — names are
// names. The internal /eu page (src/pages/eu-preview.tsx) is the raw-table
// debug view; this is the public-facing UI.

import { PriceFormat } from "@/components/position-card";
import { api } from "@/lib/api";
import type {
  MarketConfig,
  MarketDealing,
  MarketStats,
  Tone,
} from "@/lib/markets/types";
import type { EuDealing } from "@/types/ddbx";

/** SEK formatter bundle. Swedish stocks trade in decimal kronor; values are
 *  already in major units (SEK), so quoteToValue = 1 and normalizeLivePrice
 *  is identity. EUR-denominated rows (occasional cross-listed issues) will
 *  render with the `kr` suffix in list views — accepted v1 imperfection; the
 *  detail body surfaces native currency. */
const SEK_FORMAT: PriceFormat = {
  formatPrice: (n) => `${n.toFixed(2)} kr`,
  formatValue: (n) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "SEK",
      maximumFractionDigits: 0,
    }).format(n),
  quoteToValue: 1,
};

/* ─── Swedish → English translation ──────────────────────────────────── */

/** FI publishes a closed set of `nature` strings derived from the MAR Annex
 *  template. We map the head of the string (FI commonly suffixes free text
 *  like "Lösen ökning" / "Lösen minskning") to an English label and a
 *  visual tone. Ordered so the longest, most specific prefix wins. */
const NATURE_MAP: Array<{ prefix: string; label: string; tone: Tone }> = [
  { prefix: "interntransaktion", label: "Internal transaction", tone: "neutral" },
  { prefix: "förvärv", label: "Acquisition", tone: "buy" },
  { prefix: "teckning", label: "Subscription", tone: "buy" },
  { prefix: "avyttring", label: "Disposal", tone: "sell" },
  { prefix: "tilldelning", label: "Grant", tone: "grant" },
  { prefix: "fusion", label: "Merger", tone: "neutral" },
  { prefix: "utdelning", label: "Dividend", tone: "neutral" },
  { prefix: "utbyte", label: "Exchange", tone: "neutral" },
  { prefix: "inlösen", label: "Redemption", tone: "neutral" },
  { prefix: "lösen", label: "Exercise", tone: "exercise" },
  { prefix: "pantsättning", label: "Pledge", tone: "neutral" },
  { prefix: "lån", label: "Loan", tone: "neutral" },
  { prefix: "gåva", label: "Gift", tone: "neutral" },
  { prefix: "arv", label: "Inheritance", tone: "neutral" },
];

function normaliseSwedish(s: string): string {
  // FI's CSV uses U+00A0 (non-breaking space) inside long role names.
  // Normalise to plain spaces before matching so the lookup keys read
  // naturally and don't have to embed escape sequences.
  return s.replace(/ /g, " ").trim().toLowerCase();
}

function translateNature(nature: string): { label: string; tone: Tone } {
  const n = normaliseSwedish(nature);
  for (const entry of NATURE_MAP) {
    if (n.startsWith(entry.prefix)) return { label: entry.label, tone: entry.tone };
  }
  return { label: nature || "—", tone: "neutral" };
}

const ROLE_MAP: Record<string, string> = {
  "styrelseledamot": "Board member",
  "styrelseordförande": "Board chair",
  "styrelsesuppleant": "Deputy board member",
  "vd": "CEO",
  "verkställande direktör": "CEO",
  "verkställande direktör (vd)": "CEO",
  "vice vd": "Deputy CEO",
  "annan ledande befattningshavare": "Senior officer",
  "annan medlem i bolagets administrations-, lednings- eller kontrollorgan":
    "Other governance member",
  "arbetstagarrepresentant i styrelsen eller arbetstagarsuppleant":
    "Employee representative",
  "ekonomichef": "CFO",
  "ekonomichef/finanschef/finansdirektör": "CFO",
  "revisor": "Auditor",
};

/** Role can be a single value or a comma-separated list ("Vice VD,
 *  Ekonomichef/..."). Critically, some single roles also contain a comma —
 *  "Annan medlem i bolagets administrations-, lednings- eller kontrollorgan"
 *  is the most common role on FI and would shred under a naive split. So try
 *  the whole string first; only fall back to splitting if no match. */
function translateRole(role: string | undefined): string | undefined {
  if (!role) return undefined;
  const direct = ROLE_MAP[normaliseSwedish(role)];
  if (direct) return direct;
  const parts = role.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return undefined;
  const mapped = parts.map((p) => ROLE_MAP[normaliseSwedish(p)] ?? p);
  return mapped.join(" · ");
}

/* ─── Wire → MarketDealing normalization ─────────────────────────────── */

function rowValue(d: EuDealing): number | null {
  if (d.price == null) return null;
  return d.price * d.volume;
}

/** Direct PDMR acquisitions outside any share programme — the cleanest
 *  conviction-style buys. Used both for the Signal view filter and for the
 *  shell's row-opacity mute (matches UK's isSuggestedDealing). */
function isCleanBuy(d: EuDealing): boolean {
  const t = translateNature(d.nature).tone;
  if (t !== "buy") return false;
  if (d.reporter.is_closely_associated) return false;
  if (d.is_share_programme) return false;
  return true;
}

function toMarketDealing(d: EuDealing): MarketDealing<EuDealing> {
  const action = translateNature(d.nature);
  const suffix = d.reporter.is_closely_associated ? " (PCA)" : "";
  return {
    key: d.id,
    id: d.id,
    // No clean ticker in MAR data — ISIN is the cross-border security ID.
    // Surfaced in the row's ticker column so the user has *something* to copy.
    ticker: d.isin,
    company: d.company,
    insiderName: d.reporter.name,
    insiderRole: translateRole(d.reporter.role),
    disclosedDate: d.disclosed_date,
    tradeDate: d.trade_date,
    isPurchase: isCleanBuy(d),
    value: rowValue(d),
    entryPrice: d.price,
    shares: d.volume,
    legCount: 1,
    actionLabel: action.label + suffix,
    actionTone: action.tone,
    raw: d,
  };
}

/* ─── Slot: RowActionCell (flag chips for MAR-specific signals) ──────── */

const CHIP_BASE =
  "inline-flex items-center justify-center rounded-md border whitespace-nowrap px-2 py-0.5 text-[11px]";

const CHIP_TONES: Record<"weak" | "neutral", string> = {
  weak: "bg-amber-200/15 text-amber-900/70 border-amber-400/25 dark:text-amber-200/60 dark:border-amber-300/20",
  neutral: "bg-transparent text-[#b0a898] border-[#d8d0c6]/60 dark:text-foreground/45",
};

function SwedenRowActionCell({ dealing }: { dealing: MarketDealing<EuDealing> }) {
  const d = dealing.raw;
  const chips: Array<{ label: string; tone: "weak" | "neutral" }> = [];
  // PCA and Programme weaken the signal — surfaced as the only chips that
  // earn space in the row (matches US's "Amendment / Late" discipline).
  if (d.reporter.is_closely_associated) chips.push({ label: "PCA", tone: "weak" });
  if (d.is_share_programme) chips.push({ label: "Programme", tone: "weak" });
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

/* ─── Slot: DetailBody (MAR fields + raw JSON) ───────────────────────── */

function fmtNativeMoney(n: number | null, ccy: string): string {
  if (n == null) return "—";
  try {
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: ccy || "SEK",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `${ccy} ${Math.round(n).toLocaleString("en-GB")}`;
  }
}

function fmtNativePrice(n: number | null, ccy: string): string {
  if (n == null) return "—";
  const num = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 }).format(n);
  return `${num} ${ccy}`;
}

function SwedenDetailBody({ dealing }: { dealing: MarketDealing<EuDealing> }) {
  const d = dealing.raw;
  const action = translateNature(d.nature);
  const value = rowValue(d);
  const flags: Array<{ label: string; tone: "weak" | "neutral" }> = [];
  if (d.reporter.is_closely_associated) flags.push({ label: "PCA filing", tone: "weak" });
  if (d.is_share_programme) flags.push({ label: "Share programme", tone: "weak" });
  if (d.is_first_time_report) flags.push({ label: "First-time report", tone: "neutral" });
  if (d.is_amendment) flags.push({ label: "Amendment", tone: "neutral" });

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 py-4 border-y border-black/10 dark:border-white/10">
        <Field label="Insider" value={d.reporter.name} />
        <Field label="Role" value={translateRole(d.reporter.role) ?? "—"} />
        <Field label="Action" value={action.label} />
        <Field label="Value" value={fmtNativeMoney(value, d.currency)} />
        <Field label="Shares" value={d.volume.toLocaleString("en-GB")} />
        <Field label="Price" value={fmtNativePrice(d.price, d.currency)} />
      </dl>

      {flags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {flags.map((f) => (
            <span key={f.label} className={`${CHIP_BASE} ${CHIP_TONES[f.tone]}`}>
              {f.label}
            </span>
          ))}
        </div>
      )}

      {d.is_amendment && d.amendment_reason && (
        <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-1">
            Amendment reason
          </div>
          <div className="text-foreground/85">{d.amendment_reason}</div>
        </div>
      )}

      <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3">
        <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-2">
          Instrument
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-sm">
          <Field label="Name" value={d.instrument_name || "—"} />
          <Field label="Type" value={d.instrument_type || "—"} />
          <Field label="ISIN" value={d.isin} mono />
          <Field label="LEI" value={d.lei} mono />
          {d.venue && <Field label="Venue" value={d.venue} />}
          <Field label="Currency" value={d.currency || "—"} />
        </div>
      </div>

      {d.reporter.filing_entity && d.reporter.filing_entity !== d.reporter.name && (
        <div className="rounded-lg border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-surface px-4 py-3 text-sm">
          <div className="text-xs uppercase tracking-wide font-semibold text-muted mb-1">
            Filing entity
          </div>
          <div className="text-foreground/85">{d.reporter.filing_entity}</div>
          <div className="text-xs text-muted mt-1">
            (FI: Anmälningsskyldig — the legal entity that filed on behalf of the PDMR)
          </div>
        </div>
      )}

      <details className="text-xs text-muted">
        <summary className="cursor-pointer hover:text-foreground transition-colors">
          Raw filing (Swedish source fields)
        </summary>
        <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <Field label="Nature (raw)" value={d.nature} />
          <Field label="Role (raw)" value={d.reporter.role} />
          <Field label="Status" value={d.status || "—"} />
          <Field label="Volume unit" value={d.volume_unit || "—"} />
          <Field label="Disclosed" value={d.disclosed_date} mono />
          <Field label="Trade date" value={d.trade_date} mono />
          <Field label="ID" value={d.id} mono />
        </dl>
        <pre className="mt-3 overflow-x-auto rounded bg-black/85 dark:bg-black/60 p-3 text-[11px] text-slate-100 leading-snug">
          {JSON.stringify(d, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[10px] text-muted uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className={`text-sm font-medium truncate ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}

/* ─── MarketConfig ───────────────────────────────────────────────────── */

export const SwedenMarket: MarketConfig<EuDealing> = {
  id: "se",
  title: "Sweden director dealings (preview)",
  description: (
    <>
      Finansinspektionen <em>Insynsregister</em> — Sweden&apos;s MAR Article 19
      register of trades by PDMRs (Persons Discharging Managerial
      Responsibilities) and their close associates. Hourly ingest from FI; no
      analysis layer yet.{" "}
      <strong className="text-foreground/75">Signal</strong> = direct PDMR
      acquisitions outside any share programme.{" "}
      <strong className="text-foreground/75">All filings</strong> includes
      disposals, grants, pledges and closely-associated (PCA) filings.
    </>
  ),
  marketLabel: "Swedish",
  topNotice: "Swedish dealings are in BETA.",
  priceFormat: SEK_FORMAT,
  // Live SEK prices land in the same major unit as EuDealing.price, so the
  // shell's stock-return math works without conversion. (No price-history
  // wiring for ISIN-quoted Swedish instruments yet — DetailPosition omitted.)
  normalizeLivePrice: (close_pence) => close_pence,
  // OMXS30 ticker on Yahoo. Not yet wired into /api/prices for SE — kept
  // here so when ISIN-based price history lands, the benchmark slot is
  // already labelled correctly.
  benchmarkTicker: "^OMX",
  benchmarkLabel: "OMXS30",
  views: [
    { id: "signal", label: "Signal" },
    { id: "all", label: "All filings" },
  ],
  defaultView: "signal",
  pollIntervalMs: 60_000,
  async fetchDealings({ view }) {
    const r = await api.euDealings({ market: "SE", limit: 500 });
    const all = r.dealings;
    const signal = all.filter(isCleanBuy);
    const selected = view === "signal" ? signal : all;
    const stats: MarketStats = {
      total: all.length,
      viewCounts: {
        signal: signal.length,
        all: all.length,
      },
      latestDisclosedLabel: r.stats.latest_disclosed_date
        ? `Latest disclosure ${r.stats.latest_disclosed_date.slice(0, 10)}`
        : undefined,
    };
    return { dealings: selected.map(toMarketDealing), stats };
  },
  RowActionCell: SwedenRowActionCell,
  DetailBody: SwedenDetailBody,
  // No DetailPosition — Swedish instruments are keyed by ISIN; the
  // ticker-based price history endpoint doesn't cover them yet.
  // No fetchNews — no Swedish news source wired yet.
  // No useGating — Sweden mirrors /us, no discretion mode.
  // No useMetricMode — no analysis layer to drive alpha-vs-raw toggles.
  renderEmptyState: ({ view, stats, setView }) => {
    const total = stats?.total ?? 0;
    const all = stats?.viewCounts.all ?? 0;
    if (view === "signal") {
      return (
        <>
          No direct PDMR buys in the latest scan.{" "}
          <button
            onClick={() => setView("all")}
            className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
          >
            Show all {all} filings
          </button>
        </>
      );
    }
    return (
      <>
        No Swedish dealings stored yet. The hourly cron fills this at :20 past
        each hour ({total} total today).
      </>
    );
  },
};
