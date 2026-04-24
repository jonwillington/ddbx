import type { Env } from "../index";
import type { Analysis } from "../db/types";
import { scrapeDealings } from "./scrape";
import { triageDealing } from "./triage";
import { analyzeDealing } from "./analyze";
import { ensureDirectorProfile } from "./profile";
import { ensureCompanyProfile } from "./company-profile";
import { refreshPerformance } from "./performance";
import { postTweet } from "./twitter";
import { sendPushNotifications } from "./apns";
import {
  finishPipelineRun,
  insertAnalysis,
  insertDealing,
  insertTriage,
  startPipelineRun,
  upsertDirector,
  upsertTicker,
} from "../db/writes";

export interface PipelineResult {
  scraped: number;
  new_dealings: number;
  triaged: number;
  analyzed: number;
  performance_updated: number;
  errors: string[];
}

export async function runPipeline(env: Env): Promise<PipelineResult> {
  const errors: string[] = [];
  const result: PipelineResult = {
    scraped: 0,
    new_dealings: 0,
    triaged: 0,
    analyzed: 0,
    performance_updated: 0,
    errors,
  };

  const runId = await startPipelineRun(env, "nightly").catch(() => "");

  try {
    const dealings = await scrapeDealings(env);
    result.scraped = dealings.length;

    for (const d of dealings) {
      try {
        await upsertDirector(env, d.director);
        await upsertTicker(env, { ticker: d.ticker, company: d.company, disclosed_date: d.disclosed_date });
        const fresh = await insertDealing(env, d);
        if (!fresh) continue; // already processed on a prior run
        result.new_dealings++;

        await ensureDirectorProfile(env, d.director);
        // Refresh the company profile in the background. A profile failure
        // must never block the rest of the dealing pipeline.
        await ensureCompanyProfile(env, d.ticker, d.company).catch(
          (err: Error) =>
            errors.push(`company-profile ${d.ticker}: ${err.message}`),
        );

        const triage = await triageDealing(env, d);
        await insertTriage(
          env,
          d.id,
          { verdict: triage.verdict, reason: triage.reason },
          triage.usage,
        );
        result.triaged++;

        const basePushPayload = {
          id: d.id,
          ticker: d.ticker,
          company: d.company,
          director_name: d.director.name,
          value_gbp: d.value_gbp,
        };

        let analysis: Analysis | undefined;

        if (triage.verdict === "promising" || triage.verdict === "maybe") {
          try {
            const analyzed = await analyzeDealing(env, d);
            await insertAnalysis(env, d.id, analyzed.analysis, analyzed.usage);
            result.analyzed++;
            analysis = analyzed.analysis;
            if (["significant", "noteworthy"].includes(analyzed.analysis.rating)) {
              await postTweet(env, { ...basePushPayload, analysis: analyzed.analysis })
                .catch((err: Error) => errors.push(`twitter ${d.id}: ${err.message}`));
            }
          } catch (err) {
            errors.push(`analyze ${d.id}: ${(err as Error).message}`);
          }
        }

        // Push fans out by notify_level: noteworthy+ → 'noteworthy' and 'all';
        // everything else (including unanalysed skip-verdict buys) → 'all' only.
        await sendPushNotifications(env, { ...basePushPayload, analysis })
          .catch((err: Error) => errors.push(`apns ${d.id}: ${err.message}`));
      } catch (err) {
        errors.push(`dealing ${d.id}: ${(err as Error).message}`);
      }
    }

    // Analyse any backfilled deals that got triaged but weren't analysed
    // (e.g. because the backfill HTTP request timed out mid-way).
    const pending = await env.DB.prepare(
      `SELECT d.id, d.trade_date, d.disclosed_date, d.ticker, d.company,
              d.tx_type, d.shares, d.price_pence, d.value_gbp,
              dir.id AS dir_id, dir.name AS dir_name, dir.role AS dir_role,
              dir.company_primary AS dir_company
         FROM dealings d
         JOIN directors dir ON dir.id = d.director_id
         JOIN triage t ON t.dealing_id = d.id
         LEFT JOIN analyses a ON a.dealing_id = d.id
        WHERE t.verdict IN ('promising','maybe')
          AND a.dealing_id IS NULL
        ORDER BY d.trade_date DESC
        LIMIT 10`,
    ).all<{
      id: string; trade_date: string; disclosed_date: string;
      ticker: string; company: string; tx_type: string;
      shares: number; price_pence: number; value_gbp: number;
      dir_id: string; dir_name: string; dir_role: string | null; dir_company: string | null;
    }>();

    for (const row of pending.results) {
      try {
        const d = {
          id: row.id, trade_date: row.trade_date, disclosed_date: row.disclosed_date,
          ticker: row.ticker, company: row.company, tx_type: row.tx_type as "buy" | "sell",
          shares: row.shares, price_pence: row.price_pence, value_gbp: row.value_gbp,
          director: { id: row.dir_id, name: row.dir_name, role: row.dir_role ?? "Director", company: row.dir_company ?? row.company },
        };
        const analyzed = await analyzeDealing(env, d);
        await insertAnalysis(env, d.id, analyzed.analysis, analyzed.usage);
        result.analyzed++;
      } catch (err) {
        errors.push(`analyze-pending ${row.id}: ${(err as Error).message}`);
      }
    }

    const perf = await refreshPerformance(env);
    result.performance_updated = perf.updated;
  } catch (err) {
    errors.push(`pipeline: ${(err as Error).message}`);
  }

  if (runId) {
    await finishPipelineRun(
      env,
      runId,
      errors.length === 0 ? "ok" : "error",
      result as unknown as Record<string, unknown>,
      errors.join("; ") || undefined,
    ).catch(() => undefined);
  }
  return result;
}
