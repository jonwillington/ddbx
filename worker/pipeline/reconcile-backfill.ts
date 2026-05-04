import type { Env } from "../index";
import { hashDealing } from "../db/writes";
import { reconcileTradeFields } from "./reconcile";

export interface BackfillRowChange {
  old_id: string;
  new_id: string;
  ticker: string;
  trade_date: string;
  changes: string[];
  /** True when shares/price changed, meaning the LLM-generated triage/analysis
   *  text (which references the old £k figure) is now stale. */
  needs_reanalysis: boolean;
  applied: boolean;
  /** Why an apply attempt was skipped, if any. */
  skipped?: string;
}

export interface ReconcileBackfillResult {
  scanned: number;
  changed: number;
  applied: number;
  skipped: number;
  errors: string[];
  rows: BackfillRowChange[];
}

interface DealingRow {
  id: string;
  ticker: string;
  trade_date: string;
  shares: number;
  price_pence: number;
  value_gbp: number;
}

/**
 * Apply explicit corrected fields to a single dealing. Used by manual
 * /__fix-dealing operations where the operator has independently sourced
 * the correct values (e.g. by reading the original RNS) and wants to
 * bypass reconcile heuristics. Mirrors the FK-migration logic used by
 * reconcileBackfill so the dealing id stays consistent with its hash.
 */
export async function applyDealingCorrection(
  env: Env,
  args: {
    id: string;
    shares: number;
    price_pence: number;
    value_gbp: number;
  },
): Promise<{
  old_id: string;
  new_id: string;
  id_changed: boolean;
  applied: true;
}> {
  const row = await env.DB.prepare(
    `SELECT id, ticker, trade_date, shares, price_pence, value_gbp, director_id
       FROM dealings WHERE id = ?1`,
  )
    .bind(args.id)
    .first<DealingRow & { director_id: string }>();
  if (!row) throw new Error(`dealing ${args.id} not found`);

  const newHash = await hashDealing({
    trade_date: row.trade_date,
    director_id: row.director_id,
    ticker: row.ticker,
    shares: args.shares,
    price_pence: args.price_pence,
  });
  const newId = `d-${newHash.slice(0, 16)}`;
  const idChanged = newId !== row.id;

  if (idChanged) {
    const collision = await env.DB.prepare(
      `SELECT id FROM dealings WHERE id = ?1`,
    )
      .bind(newId)
      .first<{ id: string }>();
    if (collision)
      throw new Error(`target id ${newId} already exists; refusing overwrite`);

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO dealings
           (id, hash, trade_date, disclosed_date, director_id, ticker,
            company, tx_type, shares, price_pence, value_gbp, raw_json,
            created_at)
         SELECT ?1, ?2, trade_date, disclosed_date, director_id, ticker,
                company, tx_type, ?3, ?4, ?5, raw_json, created_at
           FROM dealings WHERE id = ?6`,
      ).bind(
        newId,
        newHash,
        args.shares,
        args.price_pence,
        args.value_gbp,
        row.id,
      ),
      env.DB.prepare(
        `UPDATE triage SET dealing_id = ?1 WHERE dealing_id = ?2`,
      ).bind(newId, row.id),
      env.DB.prepare(
        `UPDATE analyses SET dealing_id = ?1 WHERE dealing_id = ?2`,
      ).bind(newId, row.id),
      env.DB.prepare(
        `DELETE FROM performance WHERE dealing_id = ?1`,
      ).bind(row.id),
      env.DB.prepare(`DELETE FROM dealings WHERE id = ?1`).bind(row.id),
    ]);
  } else {
    await env.DB.prepare(
      `UPDATE dealings
          SET shares = ?1, price_pence = ?2, value_gbp = ?3
        WHERE id = ?4`,
    )
      .bind(args.shares, args.price_pence, args.value_gbp, row.id)
      .run();
  }

  return { old_id: row.id, new_id: newId, id_changed: idChanged, applied: true };
}

/**
 * Walks every dealing, re-runs reconcileTradeFields against the current
 * prices table, and (when `apply` is true) updates rows where the corrected
 * values differ from stored ones. Default is dry-run — surfaces the proposed
 * changes without writing, so the operator can eyeball before committing.
 *
 * When the corrected (shares, price_pence) pair changes, the dealing's id
 * (which is a hash of those fields) also changes. Foreign keys in
 * triage/analyses/performance are migrated atomically via D1 batch. The
 * performance rows are deleted rather than rewritten — they'll be recomputed
 * on the next refreshPerformance run, which is cheaper and avoids stale
 * horizon snapshots.
 */
export async function reconcileBackfill(
  env: Env,
  opts: { apply?: boolean; limit?: number; ids?: string[] } = {},
): Promise<ReconcileBackfillResult> {
  const apply = !!opts.apply;
  const limit = Math.max(1, Math.min(5000, opts.limit ?? 5000));
  const idFilter = opts.ids?.filter((s) => s.length > 0) ?? [];

  const rows = idFilter.length
    ? await env.DB.prepare(
        `SELECT id, ticker, trade_date, shares, price_pence, value_gbp
           FROM dealings
           WHERE id IN (${idFilter.map((_, i) => `?${i + 1}`).join(",")})`,
      )
        .bind(...idFilter)
        .all<DealingRow>()
    : await env.DB.prepare(
        `SELECT id, ticker, trade_date, shares, price_pence, value_gbp
           FROM dealings
           ORDER BY trade_date DESC
           LIMIT ?1`,
      )
        .bind(limit)
        .all<DealingRow>();

  const result: ReconcileBackfillResult = {
    scanned: rows.results.length,
    changed: 0,
    applied: 0,
    skipped: 0,
    errors: [],
    rows: [],
  };

  for (const row of rows.results) {
    try {
      const marketRow = await env.DB.prepare(
        `SELECT close_pence FROM prices
          WHERE ticker = ?1 AND date <= ?2
          ORDER BY date DESC LIMIT 1`,
      )
        .bind(row.ticker, row.trade_date)
        .first<{ close_pence: number }>();

      const reconciled = reconcileTradeFields({
        shares: row.shares,
        price_pence: row.price_pence,
        value_gbp: row.value_gbp,
        market_price_pence: marketRow?.close_pence,
      });

      if (reconciled.changes.length === 0) continue;
      result.changed++;

      const directorIdRow = await env.DB.prepare(
        `SELECT director_id FROM dealings WHERE id = ?1`,
      )
        .bind(row.id)
        .first<{ director_id: string }>();
      if (!directorIdRow) {
        result.errors.push(`${row.id}: director_id not found`);
        continue;
      }

      const newHash = await hashDealing({
        trade_date: row.trade_date,
        director_id: directorIdRow.director_id,
        ticker: row.ticker,
        shares: reconciled.shares,
        price_pence: reconciled.price_pence,
      });
      const newId = `d-${newHash.slice(0, 16)}`;
      const idChanged = newId !== row.id;

      const change: BackfillRowChange = {
        old_id: row.id,
        new_id: newId,
        ticker: row.ticker,
        trade_date: row.trade_date,
        changes: reconciled.changes,
        needs_reanalysis: idChanged,
        applied: false,
      };

      if (!apply) {
        result.rows.push(change);
        continue;
      }

      // Only an issue when the corrected hash collides with another existing
      // dealing — would happen if two RNS announcements describe the same
      // trade. Skip rather than overwrite the other row.
      if (idChanged) {
        const collision = await env.DB.prepare(
          `SELECT id FROM dealings WHERE id = ?1`,
        )
          .bind(newId)
          .first<{ id: string }>();
        if (collision) {
          change.skipped = `target id ${newId} already exists`;
          result.skipped++;
          result.rows.push(change);
          continue;
        }
      }

      const statements = idChanged
        ? [
            // Order: insert new dealings row, repoint FKs, delete old. Doing
            // it in the opposite order would briefly violate the triage /
            // analyses FK to dealings(id).
            env.DB.prepare(
              `INSERT INTO dealings
                 (id, hash, trade_date, disclosed_date, director_id, ticker,
                  company, tx_type, shares, price_pence, value_gbp, raw_json,
                  created_at)
               SELECT ?1, ?2, trade_date, disclosed_date, director_id, ticker,
                      company, tx_type, ?3, ?4, ?5, raw_json, created_at
                 FROM dealings WHERE id = ?6`,
            ).bind(
              newId,
              newHash,
              reconciled.shares,
              reconciled.price_pence,
              reconciled.value_gbp,
              row.id,
            ),
            env.DB.prepare(
              `UPDATE triage SET dealing_id = ?1 WHERE dealing_id = ?2`,
            ).bind(newId, row.id),
            env.DB.prepare(
              `UPDATE analyses SET dealing_id = ?1 WHERE dealing_id = ?2`,
            ).bind(newId, row.id),
            env.DB.prepare(
              `DELETE FROM performance WHERE dealing_id = ?1`,
            ).bind(row.id),
            env.DB.prepare(`DELETE FROM dealings WHERE id = ?1`).bind(row.id),
          ]
        : [
            env.DB.prepare(
              `UPDATE dealings
                  SET shares = ?1, price_pence = ?2, value_gbp = ?3
                WHERE id = ?4`,
            ).bind(
              reconciled.shares,
              reconciled.price_pence,
              reconciled.value_gbp,
              row.id,
            ),
          ];

      await env.DB.batch(statements);
      change.applied = true;
      result.applied++;
      result.rows.push(change);
    } catch (err) {
      result.errors.push(`${row.id}: ${(err as Error).message}`);
    }
  }

  return result;
}
