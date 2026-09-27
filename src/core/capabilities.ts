import { indexGraph, resolveBranch, branchSubgraph } from './network-flow';
import type { Manifest, Dataset } from './types';

export function primaryScore(m: Manifest) {
  const keys = [...new Set(m.items.flatMap((item) => Object.keys(item.scores ?? {})))];
  return m.primaryScore && keys.includes(m.primaryScore)
    ? m.primaryScore
    : keys.includes('model')
      ? 'model'
      : (keys[0] ?? 'vector_norm');
}
export function scoreLabel(m: Manifest, key = primaryScore(m)) {
  return (
    m.scoreDefinitions?.[key]?.label ??
    (m.provenance?.scoreLabels as Record<string, string> | undefined)?.[key] ??
    key.replaceAll('_', ' ')
  );
}
export function probabilityScore(m: Manifest, key = primaryScore(m)) {
  const declared = m.scoreDefinitions?.[key];
  return declared
    ? declared.kind === 'probability'
    : key === 'model' && m.model?.kind !== 'vector' && !!m.model;
}
export function ensureMeasures(dataset: Dataset) {
  const m = dataset.manifest;
  if (
    m.items.some((i) => Object.values(i.scores ?? {}).some((v) => v != null && Number.isFinite(v)))
  )
    return;
  const rep = m.representations[0],
    matrix = dataset.matrices.get(rep.id)!;
  m.items.forEach((item, i) => {
    let square = 0;
    for (let j = 0; j < matrix.cols; j++) square += matrix.data[i * matrix.cols + j] ** 2;
    item.scores = { ...item.scores, vector_norm: Math.sqrt(square) };
  });
  m.primaryScore = 'vector_norm';
  m.scoreDefinitions = {
    ...m.scoreDefinitions,
    vector_norm: { kind: 'quantity', label: rep.name + ' · vector norm' },
  };
  m.provenance = {
    ...m.provenance,
    derivedMeasure:
      'Euclidean norm of the first supplied representation. This is a geometric measurement, not a model prediction.',
  };
}

/** Prefer an inspectable, labeled example excluded from fitting. */
export function defaultFocusIndex(m: Manifest): number {
  const held = m.items.findIndex((i) => i.media && i.split === 'holdout' && i.label !== null);
  return held >= 0
    ? held
    : Math.max(
        0,
        m.items.findIndex((i) => i.media),
      );
}
export function defaultComparisonIndex(m: Manifest, focus = defaultFocusIndex(m)): number {
  const label = m.items[focus]?.label;
  const opposite = m.items.findIndex(
    (i, n) =>
      n !== focus &&
      i.media &&
      i.split === 'holdout' &&
      i.label !== null &&
      label !== null &&
      i.label !== label,
  );
  if (opposite >= 0) return opposite;
  const preview = m.items.findIndex((i, n) => n !== focus && i.media);
  return preview >= 0 ? preview : focus === 0 ? Math.min(1, m.items.length - 1) : 0;
}
export function mostActive(values: ArrayLike<number>): number {
  let best = 0;
  for (let i = 1; i < values.length; i++)
    if (Math.abs(values[i]) > Math.abs(values[best])) best = i;
  return best;
}
/** Avoid offering aliases of the same ranking as if they were different measurements. */
export function distinctScoreKeys(m: Manifest): string[] {
  const primary = primaryScore(m);
  const keys = [...new Set([primary, ...m.items.flatMap((i) => Object.keys(i.scores ?? {}))])];
  return keys.filter(
    (key, n) =>
      !keys
        .slice(0, n)
        .some((other) =>
          m.items.every((i) => Object.is(i.scores?.[key] ?? null, i.scores?.[other] ?? null)),
        ),
  );
}

/** Start inside the branch that produces the graph output, not an upstream auxiliary model. */
export function defaultNetworkNode(m: Manifest, branch = ''): string {
  if (!m.model) return '';
  const index = indexGraph(m.model);
  const ids = branchSubgraph(index, resolveBranch(index, branch)).nodes;
  return (
    ids.find((id) => index.nodes.get(id)?.op === 'dense') ??
    m.model.nodes.find((n) => n.op === 'dense')?.id ??
    ''
  );
}
