import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import DefaultLayout from "@/layouts/default";
import { title, subtitle } from "@/components/primitives";
import { DealingRow } from "@/components/dealing-row";
import { DealingDetailPanel } from "@/components/dealing-detail-panel";
import { Skeleton } from "@/components/skeleton";
import { api, type Dealing, type DirectorDetail } from "@/lib/api";

function pct(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function DirectorPage() {
  const { id } = useParams<{ id: string }>();
  const [selected, setSelected] = useState<Dealing | null>(null);
  const [d, setD] = useState<DirectorDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .director(id)
      .then(setD)
      .catch((e) => setErr((e as Error).message));
  }, [id]);

  if (err) return <DefaultLayout>Error: {err}</DefaultLayout>;
  if (!d) return <DefaultLayout><DirectorSkeleton /></DefaultLayout>;

  return (
    <DefaultLayout>
      <section className="py-8 space-y-8 animate-content-in">
        <div>
          <h1 className={title({ size: "sm" })}>{d.name}</h1>
          <p className={subtitle({ class: "mt-2" })}>
            {d.role} · {d.company}
            {d.age_band && ` · ${d.age_band}`}
            {d.tenure_years != null && ` · ${d.tenure_years}y tenure`}
          </p>
        </div>

        {d.profile && (
          <div className="border border-separator rounded-lg bg-surface/40 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold mb-1">Biography</h3>
              <p className="text-sm text-foreground/90">{d.profile.biography}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-1">Track record</h3>
              <p className="text-sm text-foreground/90">
                {d.profile.track_record_summary}
              </p>
            </div>
            {d.profile.flags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold mb-1 text-red-400">Flags</h3>
                <ul className="text-sm list-disc pl-5 text-red-400/90">
                  {d.profile.flags.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Hit rate" value={`${d.hit_rate_pct.toFixed(0)}%`} />
          <Stat label="Avg 3m" value={pct(d.avg_return_by_horizon["3m"] ?? null)} />
          <Stat label="Avg 6m" value={pct(d.avg_return_by_horizon["6m"] ?? null)} />
          <Stat label="Avg 12m" value={pct(d.avg_return_by_horizon["12m"] ?? null)} />
          <Stat label="Avg 24m" value={pct(d.avg_return_by_horizon["24m"] ?? null)} />
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-3">Prior picks</h2>
          {d.prior_picks.length === 0 ? (
            <p className="text-sm text-muted">No prior picks on record yet.</p>
          ) : (
            <div className="space-y-3">
              {d.prior_picks.map((pick) => (
                <DealingRow
                  key={pick.id}
                  dealing={pick}
                  selected={selected?.id === pick.id}
                  onSelect={setSelected}
                />
              ))}
            </div>
          )}
        </div>
      </section>
      <DealingDetailPanel
        dealing={selected}
        onClose={() => setSelected(null)}
      />
    </DefaultLayout>
  );
}

function DirectorSkeleton() {
  return (
    <section className="py-8 space-y-8">
      <div className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="border border-separator rounded-lg bg-surface/40 p-4 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-11/12" />
          <Skeleton className="h-3 w-9/12" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-10/12" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="border border-separator rounded-lg bg-surface/40 p-3 space-y-2">
            <Skeleton className="h-3 w-12" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-32" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="border border-separator/50 rounded-lg p-4 flex gap-4">
            <Skeleton className="h-10 w-16 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
            <Skeleton className="h-6 w-20 shrink-0" />
          </div>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-separator rounded-lg bg-surface/40 p-3">
      <div className="text-xs text-muted uppercase">{label}</div>
      <div className="text-xl font-semibold mt-1">{value}</div>
    </div>
  );
}
