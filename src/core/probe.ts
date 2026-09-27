import { compute } from './engine';
import type { Dataset, GraphNode, Matrix } from './types';

function bucket(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 5;
}

/** A declared, reproducible browser experiment; never replaces a saved native model. */
export async function fitLinearProbe(dataset: Dataset): Promise<Dataset> {
  const m = structuredClone(dataset.manifest),
    rep = m.representations.find((r) => r.kind === 'embedding') ?? m.representations[0];
  const useSplit =
    m.items.some((i) => i.split === 'holdout') && m.items.some((i) => i.split === 'fit');
  const split = m.items.map((i) =>
    useSplit ? i.split : bucket(i.group ?? i.id) === 0 ? 'holdout' : 'fit',
  );
  const train = m.items
    .map((r, i) => (r.label !== null && split[i] === 'fit' ? i : -1))
    .filter((i) => i >= 0);
  if (train.length < 8 || new Set(train.map((i) => m.items[i].label)).size !== 2)
    throw new Error(
      'The fitting split needs at least 8 labeled records and both classes. Group IDs are kept together.',
    );
  await compute('load', { matrices: Object.fromEntries(dataset.matrices) });
  const r = await compute('trainProbe', {
    key: rep.id,
    labels: m.items.map((i) => i.label),
    train,
  });
  const norm = 'browser.standardized',
    logit = 'browser.logit',
    output = 'browser.probability';
  const nodes: GraphNode[] = [
    { id: norm, op: 'normalize', inputs: [rep.id], mean: r.mean, scale: r.scale },
    {
      id: logit,
      name: 'Browser logistic probe',
      op: 'dense',
      inputs: [norm],
      weight: r.weight,
      bias: r.bias,
      activation: 'linear',
    },
    { id: output, op: 'sigmoid', inputs: [logit] },
  ];
  const refit = m.model?.id === 'browser-logistic-probe';
  if (!refit) {
    m.id += '-probe';
    m.title += ' · linear probe';
  }
  m.primaryScore = 'model';
  m.scoreDefinitions = {
    ...m.scoreDefinitions,
    model: { label: 'Browser linear probe', kind: 'probability' },
  };
  m.representations = m.representations.filter((r) => r.id !== norm && r.id !== output);
  m.items = m.items.map((item, i) => ({
    ...item,
    split: split[i],
    scores: {
      ...item.scores,
      ...(!refit && item.scores?.model != null ? { supplied: item.scores.model } : {}),
      model: r.probabilities.data[i],
    },
  }));
  m.representations.push(
    {
      id: norm,
      name: 'Standardized input',
      kind: 'features',
      dimensions: rep.dimensions,
      matrix: { rows: m.items.length, cols: rep.dimensions },
    },
    {
      id: output,
      name: 'Probe probability',
      kind: 'score',
      dimensions: 1,
      matrix: { rows: m.items.length, cols: 1 },
    },
  );
  m.model = {
    id: 'browser-logistic-probe',
    kind: 'probability',
    inputs: [rep.id],
    nodes,
    output,
    threshold: 0.5,
    fit: 'browser experiment',
    reference: output,
  };
  m.provenance = {
    ...m.provenance,
    model: 'Logistic regression fitted in this browser',
    browserProbe: {
      trainingRecords: train.length,
      holdoutRecords: split.filter((s) => s === 'holdout').length,
      split: useSplit
        ? 'Supplied fit / holdout'
        : 'FNV-1a hash of group identity (or item ID); bucket 0 of 5 held out',
      objective: 'Mean binary cross-entropy + λ ||w||² / 2',
      steps: r.steps,
      learningRate: r.learningRate,
      penalty: r.penalty,
      losses: r.losses,
      normalization: 'Fitting split only',
    },
    trainingSnapshots: false,
  };
  const matrices = new Map(dataset.matrices);
  matrices.set(norm, r.standardized as Matrix);
  matrices.set(output, r.probabilities as Matrix);
  const positions = new Map(dataset.positions);
  positions.delete(norm);
  positions.delete(output);
  return { ...dataset, manifest: m, matrices, positions };
}
