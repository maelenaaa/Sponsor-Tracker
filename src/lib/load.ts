import { config } from './config';
import { getSql } from './db';
import { listDeliverables } from './services/deliverables';
import { listSponsors } from './services/sponsors';
import { extendAll } from './services/sync';

/** Loads what most pages need. First tops up recurring deliverables (additive, safe to repeat). */
export async function loadWorkspace() {
  const sql = getSql();
  const today = config.today();
  try {
    await extendAll(sql, { today, horizonDays: config.generationHorizonDays });
  } catch (err) {
    console.error('Could not extend recurring deliverables', err);
  }
  const [sponsors, deliverables] = await Promise.all([listSponsors(sql), listDeliverables(sql)]);
  return { sql, today, sponsors, deliverables, lookaheadDays: config.recommendLookaheadDays };
}
