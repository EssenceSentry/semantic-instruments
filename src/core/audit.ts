import type { Item } from './types';
import { beta, mean, quantile, seeded, shuffle } from './math';

export interface AuditBatch {
  band: number;
  ids: string[];
  positives: number;
  time: string;
}
export interface AuditBand {
  ids: string[];
  observed: number;
  positives: number;
}
export function partitionRanks(ids: string[], bands: number): string[][] {
  const h = Math.max(1, Math.min(Math.floor(bands), ids.length || 1));
  return Array.from({ length: h }, (_, i) =>
    ids.slice(Math.floor((i * ids.length) / h), Math.floor(((i + 1) * ids.length) / h)),
  );
}
export function summarizeAudit(cells: string[][], batches: AuditBatch[]): AuditBand[] {
  const seen = new Set<string>();
  const out = cells.map((ids) => ({ ids, observed: 0, positives: 0 }));
  const members = cells.map((ids) => new Set(ids));
  for (const b of batches) {
    if (
      !out[b.band] ||
      !b.ids.length ||
      !Number.isInteger(b.positives) ||
      b.positives < 0 ||
      b.positives > b.ids.length
    )
      throw new Error('Invalid audit count or band.');
    for (const id of b.ids) {
      if (!members[b.band].has(id) || seen.has(id))
        throw new Error('An audit item is outside its band or was sampled twice.');
      seen.add(id);
    }
    out[b.band].observed += b.ids.length;
    out[b.band].positives += b.positives;
  }
  return out;
}
export function nextAuditBatch(
  cells: string[][],
  batches: AuditBatch[],
  band: number,
  seed: number,
) {
  const used = new Set(batches.flatMap((b) => b.ids));
  return shuffle(
    (cells[band] ?? []).filter((id) => !used.has(id)),
    seeded(seed),
  ).slice(0, 9);
}
export interface AuditPosterior {
  endpoints: { rank: number; mean: number; low: number; high: number }[];
  cutoffs: number[];
  cutoffInterval: [number, number];
  lowerBoundCutoff: number;
  draws: number;
}
/** A finite-population beta-binomial model; count-only batches never imply item labels. */
export function auditPosterior(
  bands: AuditBand[],
  target = 0.9,
  draws = 2500,
  alpha = 1,
  betaPrior = 1,
  seed = 2718,
): AuditPosterior {
  if (alpha <= 0 || betaPrior <= 0 || !Number.isInteger(draws) || draws < 1)
    throw new Error('Invalid posterior parameters.');
  const random = seeded(seed),
    samples = bands.map(() => [] as number[]),
    cutoffs: number[] = [];
  for (let draw = 0; draw < draws; draw++) {
    let n = 0,
      positives = 0,
      cutoff = 0;
    bands.forEach((band, h) => {
      if (band.observed > band.ids.length || band.positives < 0 || band.positives > band.observed)
        throw new Error('Invalid band counts.');
      let k = band.positives;
      const q = beta(alpha + k, betaPrior + band.observed - k, random);
      // Exact binomial draws. Mini-scale keeps this simple and inspectable.
      for (let j = band.observed; j < band.ids.length; j++) if (random() < q) k++;
      n += band.ids.length;
      positives += k;
      const precision = positives / Math.max(1, n);
      samples[h].push(precision);
      if (precision >= target) cutoff = n;
    });
    cutoffs.push(cutoff);
  }
  let n = 0;
  const endpoints = samples.map((values, h) => ({
    rank: (n += bands[h].ids.length),
    mean: mean(values),
    low: quantile(values, 0.025),
    high: quantile(values, 0.975),
  }));
  return {
    endpoints,
    cutoffs,
    cutoffInterval: [quantile(cutoffs, 0.025), quantile(cutoffs, 0.975)],
    lowerBoundCutoff: Math.max(0, ...endpoints.filter((p) => p.low >= target).map((p) => p.rank)),
    draws,
  };
}
export function sampleMeanInterval(values: number[], populationSize: number) {
  const n = values.length,
    estimate = mean(values);
  if (!n || n > populationSize) return { estimate: NaN, low: NaN, high: NaN, se: NaN };
  if (n === populationSize) return { estimate, low: estimate, high: estimate, se: 0 };
  if (n < 2) return { estimate, low: NaN, high: NaN, se: NaN };
  const variance = values.reduce((s, x) => s + (x - estimate) ** 2, 0) / (n - 1);
  const se = Math.sqrt((variance / n) * (1 - n / populationSize));
  return {
    estimate,
    low: estimate - 1.959963984540054 * se,
    high: estimate + 1.959963984540054 * se,
    se,
  };
}

/** Identity of the question, ranked media population and score values. */
export function auditSessionKey(
  datasetId: string,
  question: string,
  score: string,
  items: Item[],
  ordered: number[],
) {
  const text =
    question +
    '|' +
    score +
    '|' +
    ordered.map((i) => items[i].id + ':' + items[i].scores?.[score]).join('|');
  let hash = 2166136261;
  for (const c of text) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return 'semantic-instruments:audit:v1:' + datasetId + ':' + (hash >>> 0).toString(36);
}

/** Audit only held-out previews by default when a saved fit/holdout split exists. */
export function defaultAuditScope(items: {split?: string; media?: string}[]): 'holdout' | 'all' {
  return items.some(i => i.split === 'fit') && items.some(i => i.media && i.split === 'holdout') ? 'holdout' : 'all';
}
export function auditPopulation(items: {split?: string}[], ordered: number[], scope: string): number[] {
  return scope === 'holdout' ? ordered.filter(i => items[i].split === 'holdout') : ordered;
}
