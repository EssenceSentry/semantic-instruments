import { compute } from './engine';
import { warmMedia } from './media';
import { primaryScore, probabilityScore } from './capabilities';
import { partitionRanks, summarizeAudit, defaultAuditScope, auditPopulation } from './audit';
import { ranking } from './math';
import type { Dataset, Intervention, Matrix } from './types';
export async function replayIntervention(d: Dataset, next: Intervention) {
  await compute('load', { matrices: Object.fromEntries(d.matrices) });
  const updates = new Map<string, Matrix>(),
    positions = new Map(d.positions);
  for (const bank of d.manifest.queries ?? []) {
    const defs = d.manifest.featureDefinitions?.[bank.id];
    if (!defs || (next.bankId && next.bankId !== bank.id)) continue;
    const r = await compute('features', {
      similarities: bank.similarities,
      queries: bank.items,
      definitions: defs,
      disabled: next.disabled,
      temperature: next.temperature,
      zeroFamilies: next.zeroFamilies,
      // Only removals depend on it; canonical payloads keep prepared results reusable.
      countNeutral: next.disabled.length > 0 && !!next.countNeutral,
      output: bank.features,
    });
    updates.set(bank.features, r.matrix);
  }
  if (d.manifest.model) {
    const model = d.manifest.model;
    const result = await compute('graph', {
      nodes: model.nodes,
      inputs: model.inputs,
      capture: d.manifest.representations
        .filter((r) => model.nodes.some((n) => n.id === r.id))
        .map((r) => r.id),
    });
    for (const [id, m] of Object.entries(result.matrices)) updates.set(id, m as Matrix);
  }
  for (const rep of d.manifest.representations)
    if (updates.has(rep.id) && rep.projection?.components) {
      const r = await compute('project', {
        key: rep.id,
        mean: rep.projection.mean,
        components: rep.projection.components,
      });
      positions.set(rep.id, r.matrix);
    }
  return { updates, positions };
}
export async function preparePresentation(
  d: Dataset,
  report: (text: string, done: number, total: number) => void,
  cancelled: () => boolean,
) {
  const m = d.manifest,
    previews = m.items.map((item, i) => (item.media ? i : -1)).filter((i) => i >= 0);
  const jobs: { name: string; run: () => Promise<unknown> }[] = [];
  jobs.push({
    name: 'Verify and decode all supplied previews',
    run: () =>
      warmMedia(
        previews.map((i) => ({ src: m.items[i].media!, fallback: m.items[i].mediaFallback })),
        (done, total) => report('Preparing previews · ' + done + ' / ' + total, 0, 1),
      ),
  });
  jobs.push({
    name: 'Load numerical representations',
    run: () => compute('load', { matrices: Object.fromEntries(d.matrices) }),
  });
  for (const rep of m.representations)
    if (rep.dimensions > 1 && !d.positions.has(rep.id))
      jobs.push({
        name: 'Project ' + rep.name,
        run: async () => {
          const r = rep.projection?.components
            ? await compute('project', {
                key: rep.id,
                mean: rep.projection.mean,
                components: rep.projection.components,
              })
            : await compute('pca', { key: rep.id });
          d.positions.set(rep.id, r.positions ?? r.matrix);
          if (!rep.projection)
            rep.projection = { method: 'PCA · browser', mean: r.mean, components: r.components };
        },
      });
  if (m.model) {
    const model = m.model;
    jobs.push({
      name: 'Verify the frozen model',
      run: () =>
        compute('graph', {
          nodes: model.nodes,
          inputs: model.inputs,
          capture: m.representations
            .filter((r) => model.nodes.some((n) => n.id === r.id))
            .map((r) => r.id),
        }),
    });
  }
  for (const rep of m.representations)
    for (const i of previews)
      for (const metric of ['cosine', 'euclidean'])
        jobs.push({
          name: rep.name + ' · preview neighbors',
          run: () => compute('neighbors', { key: rep.id, index: i, metric, candidates: previews }),
        });
  const measure = primaryScore(m),
    values = m.items.map((i) => i.scores?.[measure] ?? NaN).filter(Number.isFinite);
  for (const policy of ['uniform', 'largest'])
    jobs.push({
      name: 'Sampling distribution · ' + policy,
      run: () => compute('numeric', { values, n: Math.min(30, m.items.length), seed: 1, policy }),
    });
  if (previews.length) {
    const order = auditPopulation(m.items, ranking(
      Float64Array.from(m.items.map((i) => i.scores?.[measure] ?? NaN)),
      m.items,
    ).filter((i) => m.items[i].media), defaultAuditScope(m.items));
    const bands = summarizeAudit(
      partitionRanks(
        order.map((i) => m.items[i].id),
        Math.min(5, Math.max(1, Math.floor(order.length / 9))),
      ),
      [],
    );
    jobs.push({
      name: 'Mini-audit prior · 2,500 draws',
      run: () =>
        compute('audit', { bands, target: 0.9, draws: 2500, alpha: 1, beta: 1, seed: 2718 }),
    });
  }
  if (probabilityScore(m, measure))
    for (const groupBy of ['category', 'group'] as const) {
      const groups = new Map<string, number[]>();
      for (const item of m.items) {
        const p = item.scores?.[measure];
        if (p != null && Number.isFinite(p)) {
          const key = item[groupBy] ?? 'Ungrouped';
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key)!.push(p);
        }
      }
      const largest = [...groups.values()]
        .sort((a, b) => b.length - a.length)
        .slice(0, 2)
        .map((a) => a.sort((x, y) => y - x));
      jobs.push({
        name: 'Supported counts · ' + groupBy,
        run: () =>
          compute('supported', { collections: largest.flatMap((p) => [p, p]), confidence: 0.95 }),
      });
    }
  for (const bank of m.queries ?? []) {
    if (!m.featureDefinitions?.[bank.id]) continue;
    for (const temperature of [0.05, 0.1, 0.25, 0.5, 1])
      jobs.push({
        name: bank.id + ' · pooling temperature ' + temperature,
        run: () =>
          replayIntervention(d, { bankId: bank.id, disabled: [], zeroFamilies: [], temperature }),
      });
    for (const family of [...new Set(bank.items.map((q) => q.family))])
      jobs.push({
        name: bank.id + ' · ablate ' + family,
        run: () =>
          replayIntervention(d, {
            bankId: bank.id,
            disabled: [],
            zeroFamilies: [family],
            temperature: null,
          }),
      });
  }
  for (let i = 0; i < jobs.length; i++) {
    if (cancelled()) throw new Error('Preparation stopped. Completed calculations remain cached.');
    report(jobs[i].name, i, jobs.length);
    await jobs[i].run();
  }
  report('Prepared', jobs.length, jobs.length);
  return { calculations: jobs.length - 1, previews: previews.length };
}
