import type { GraphNode, ModelGraph } from './types';

/** Structural index of a model graph: every relation below is derived from `inputs`. */
export interface GraphIndex {
  graph: ModelGraph;
  nodes: Map<string, GraphNode>;
  consumers: Map<string, string[]>;
  /** Node ids in a valid topological order (graph inputs excluded). */
  order: string[];
  /** Topological rank; graph inputs receive negative ranks in declaration order. */
  rank: Map<string, number>;
}

export function indexGraph(graph: ModelGraph): GraphIndex {
  const nodes = new Map<string, GraphNode>(),
    consumers = new Map<string, string[]>(),
    inputs = new Set(graph.inputs);
  for (const n of graph.nodes) {
    if (nodes.has(n.id) || inputs.has(n.id)) throw new Error('Duplicate graph node: ' + n.id);
    nodes.set(n.id, n);
  }
  for (const n of graph.nodes)
    for (const k of n.inputs) {
      if (!nodes.has(k) && !inputs.has(k)) throw new Error('Unknown graph input: ' + k);
      if (!consumers.has(k)) consumers.set(k, []);
      consumers.get(k)!.push(n.id);
    }
  // Kahn's algorithm, stable with respect to declaration order.
  const pending = new Map(
    graph.nodes.map((n) => [n.id, n.inputs.filter((k) => nodes.has(k)).length]),
  );
  const order: string[] = [],
    ready = graph.nodes.filter((n) => pending.get(n.id) === 0).map((n) => n.id);
  while (ready.length) {
    const id = ready.shift()!;
    order.push(id);
    for (const c of consumers.get(id) ?? []) {
      const left = pending.get(c)! - 1;
      pending.set(c, left);
      if (left === 0) ready.push(c);
    }
  }
  if (order.length !== graph.nodes.length) throw new Error('Model graph contains a cycle.');
  const rank = new Map<string, number>();
  graph.inputs.forEach((id, i) => rank.set(id, i - graph.inputs.length));
  order.forEach((id, i) => rank.set(id, i));
  return { graph, nodes, consumers, order, rank };
}

/** A mean over two or more inputs is treated as an ensemble combiner. */
export const isCombiner = (n: GraphNode | undefined): n is GraphNode & { op: 'mean' } =>
  !!n && n.op === 'mean' && n.inputs.length >= 2;

export function ancestors(index: GraphIndex, id: string, includeSelf = false) {
  const out = new Set<string>(),
    stack = [id];
  while (stack.length) {
    const k = stack.pop()!;
    if (out.has(k)) continue;
    out.add(k);
    for (const p of index.nodes.get(k)?.inputs ?? []) stack.push(p);
  }
  if (!includeSelf) out.delete(id);
  return out;
}

export function descendants(index: GraphIndex, id: string, includeSelf = false) {
  const out = new Set<string>(),
    stack = [id];
  while (stack.length) {
    const k = stack.pop()!;
    if (out.has(k)) continue;
    out.add(k);
    for (const c of index.consumers.get(k) ?? []) stack.push(c);
  }
  if (!includeSelf) out.delete(id);
  return out;
}

export interface Ensemble {
  id: string;
  members: string[];
}

/** The combiner reached from the output through unary non-dense operators, if any. */
export function primaryEnsemble(index: GraphIndex): Ensemble | null {
  let id = index.graph.output;
  for (;;) {
    const n = index.nodes.get(id);
    if (!n) return null;
    if (isCombiner(n)) return { id: n.id, members: [...n.inputs] };
    if (n.inputs.length !== 1 || n.op === 'dense') return null;
    id = n.inputs[0];
  }
}

/** Every combiner in the graph: the primary one first, then nearest-to-output first. */
export function ensembles(index: GraphIndex): Ensemble[] {
  const primary = primaryEnsemble(index);
  const rest = [...index.order]
    .reverse()
    .map((id) => index.nodes.get(id)!)
    .filter((n) => isCombiner(n) && n.id !== primary?.id)
    .map((n) => ({ id: n.id, members: [...n.inputs] }));
  return primary ? [primary, ...rest] : rest;
}

/**
 * Nodes that can anchor the flow view: ensemble members (primary first) and the
 * output itself when it is not a combiner. The first entry is the default branch.
 */
export function branchRoots(index: GraphIndex): string[] {
  const all = ensembles(index),
    out: string[] = [];
  const push = (id: string) => {
    if (!out.includes(id)) out.push(id);
  };
  all[0]?.members.forEach(push);
  if (!isCombiner(index.nodes.get(index.graph.output))) push(index.graph.output);
  all.slice(1).forEach((e) => e.members.forEach(push));
  return out;
}

export interface Subgraph {
  root: string;
  /** Computed nodes of this branch in topological order (root included). */
  nodes: string[];
  /** Graph inputs this branch reads. */
  sources: string[];
  /** Other ensembles feeding this branch, shown as single collapsed values. */
  collapsed: string[];
}

/** Ancestors of `root`, stopping at graph inputs and at combiners other than the root. */
export function branchSubgraph(index: GraphIndex, root: string): Subgraph {
  const nodes = new Set<string>(),
    sources = new Set<string>(),
    collapsed = new Set<string>(),
    stack = [root];
  while (stack.length) {
    const id = stack.pop()!;
    if (nodes.has(id) || sources.has(id) || collapsed.has(id)) continue;
    const n = index.nodes.get(id);
    if (!n) sources.add(id);
    else if (id !== root && isCombiner(n)) collapsed.add(id);
    else {
      nodes.add(id);
      stack.push(...n.inputs);
    }
  }
  const byRank = (a: string, b: string) => index.rank.get(a)! - index.rank.get(b)!;
  return {
    root,
    nodes: [...nodes].sort(byRank),
    sources: [...sources].sort(byRank),
    collapsed: [...collapsed].sort(byRank),
  };
}

export function resolveBranch(index: GraphIndex, requested: string) {
  const roots = branchRoots(index);
  return roots.includes(requested) ? requested : (roots[0] ?? index.graph.output);
}

/** The branch that contains a node, preferring `preferred`. */
export function branchContaining(index: GraphIndex, nodeId: string, preferred?: string) {
  const roots = branchRoots(index);
  const ordered = preferred && roots.includes(preferred) ? [preferred, ...roots] : roots;
  return ordered.find((r) => branchSubgraph(index, r).nodes.includes(nodeId)) ?? null;
}

/**
 * Downstream chain from a branch root: the combiner it feeds and the unary
 * operators after it. `feeds` lists consumers where the chain stops short of the output.
 */
export function branchTail(index: GraphIndex, root: string) {
  const nodes: string[] = [];
  let id = root;
  while (id !== index.graph.output) {
    const cs = index.consumers.get(id) ?? [];
    if (cs.length !== 1) break;
    const next = index.nodes.get(cs[0])!;
    if (isCombiner(next) && !nodes.some((k) => isCombiner(index.nodes.get(k)))) nodes.push(next.id);
    else if (nodes.length && next.inputs.length === 1 && next.op !== 'dense') nodes.push(next.id);
    else break;
    id = next.id;
  }
  return { nodes, feeds: id === index.graph.output ? [] : (index.consumers.get(id) ?? []) };
}

/**
 * Columns aligned to the sink: a node sits one column before its furthest consumer,
 * so parallel branches of equal depth line up and skip connections span columns.
 */
export function flowColumns(index: GraphIndex, sub: Subgraph, tail: string[] = []): string[][] {
  const ids = [...sub.sources, ...sub.collapsed, ...sub.nodes],
    inView = new Set(ids),
    dist = new Map<string, number>();
  const reverse = [...ids].sort((a, b) => index.rank.get(b)! - index.rank.get(a)!);
  for (const id of reverse) {
    const cs = (index.consumers.get(id) ?? []).filter((c) => inView.has(c) && dist.has(c));
    dist.set(id, id === sub.root || !cs.length ? 0 : Math.max(...cs.map((c) => dist.get(c)! + 1)));
  }
  const depth = Math.max(0, ...dist.values()),
    columns: string[][] = Array.from({ length: depth + 1 }, () => []);
  for (const id of [...ids].sort((a, b) => index.rank.get(a)! - index.rank.get(b)!))
    columns[depth - dist.get(id)!].push(id);
  tail.forEach((id) => columns.push([id]));
  return columns;
}

export function nodeWidth(
  index: GraphIndex,
  id: string,
  trace: Record<string, ArrayLike<number>>,
): number {
  const t = trace[id];
  if (t) return t.length;
  const n = index.nodes.get(id);
  if (!n) return 0;
  if (n.op === 'dense') return n.weight?.length ?? 0;
  if (n.op === 'normalize') return n.mean?.length ?? 0;
  if (n.op === 'concat') return n.inputs.reduce((a, k) => a + nodeWidth(index, k, trace), 0);
  return nodeWidth(index, n.inputs[0], trace);
}

export interface Term {
  index: number;
  weight: number;
  input: number;
  /** The signed contribution w·x. */
  value: number;
}
export interface NeuronContribution {
  coordinate: number;
  /** All incoming terms, largest |w·x| first. */
  terms: Term[];
  bias: number;
  preactivation: number;
  activation: 'relu' | 'linear' | 'tanh';
  output: number;
}

export function activate(z: number, activation: GraphNode['activation']) {
  return activation === 'relu' ? Math.max(0, z) : activation === 'tanh' ? Math.tanh(z) : z;
}

const byMagnitude = (a: Term, b: Term) =>
  Math.abs(b.value) - Math.abs(a.value) || a.index - b.index;

/** Exact dense-neuron arithmetic, summed in the same order as `forwardRow`. */
export function denseContribution(
  node: GraphNode,
  input: ArrayLike<number>,
  coordinate: number,
): NeuronContribution {
  const w = node.weight?.[coordinate] ?? [],
    bias = node.bias?.[coordinate] ?? 0;
  const terms = w.map((weight, index) => {
    const x = input[index] ?? 0;
    return { index, weight, input: x, value: weight * x };
  });
  const preactivation = w.reduce((a, v, j) => a + v * (input[j] ?? 0), bias);
  terms.sort(byMagnitude);
  return {
    coordinate,
    terms,
    bias,
    preactivation,
    activation: node.activation ?? 'linear',
    output: activate(preactivation, node.activation),
  };
}

export interface TermSplit {
  shown: Term[];
  hiddenCount: number;
  shownSum: number;
  hiddenSum: number;
  total: number;
}

/** Keep the k largest |w·x| terms and account for everything else exactly. */
export function splitTerms(terms: Term[], k: number): TermSplit {
  const sorted = [...terms].sort(byMagnitude),
    shown = sorted.slice(0, Math.max(0, k)),
    hidden = sorted.slice(shown.length);
  const shownSum = shown.reduce((a, t) => a + t.value, 0),
    hiddenSum = hidden.reduce((a, t) => a + t.value, 0);
  return { shown, hiddenCount: hidden.length, shownSum, hiddenSum, total: shownSum + hiddenSum };
}

export interface FlowEdge {
  source: string;
  sourceIndex: number;
  target: string;
  targetIndex: number;
  /** Signed quantity carried along the edge: w·x for dense, x or x/k for add/mean. */
  value: number;
}
export interface EdgeRemainder {
  targetIndex: number;
  shown: number;
  hidden: number;
  hiddenSum: number;
}

/**
 * Top-|w·x| edges into each listed neuron of a dense node, with the exact remainder
 * of the terms that are not drawn.
 */
export function denseEdges(
  node: GraphNode,
  input: ArrayLike<number>,
  perNeuron: number,
  options: { targets?: number[]; focus?: number; focusCount?: number } = {},
) {
  const edges: FlowEdge[] = [],
    remainders: EdgeRemainder[] = [];
  const targets = options.targets ?? (node.weight ?? []).map((_, i) => i);
  for (const i of targets) {
    if (!node.weight?.[i]) continue;
    const k = i === options.focus ? (options.focusCount ?? perNeuron) : perNeuron;
    const split = splitTerms(denseContribution(node, input, i).terms, k);
    for (const t of split.shown)
      edges.push({
        source: node.inputs[0],
        sourceIndex: t.index,
        target: node.id,
        targetIndex: i,
        value: t.value,
      });
    remainders.push({
      targetIndex: i,
      shown: split.shown.length,
      hidden: split.hiddenCount,
      hiddenSum: split.hiddenSum,
    });
  }
  return { edges, remainders };
}

/** Additive terms of add (x) and mean (x / k), coordinate by coordinate. */
export function combineEdges(node: GraphNode, trace: Record<string, ArrayLike<number>>) {
  const edges: FlowEdge[] = [];
  if (node.op !== 'add' && node.op !== 'mean') return edges;
  const k = node.op === 'mean' ? node.inputs.length : 1;
  for (const source of node.inputs) {
    const x = trace[source] ?? [];
    for (let i = 0; i < x.length; i++)
      edges.push({ source, sourceIndex: i, target: node.id, targetIndex: i, value: x[i] / k });
  }
  return edges;
}

/** Where each concat input lands in the concatenated vector. */
export function concatSegments(
  index: GraphIndex,
  node: GraphNode,
  trace: Record<string, ArrayLike<number>>,
) {
  let offset = 0;
  return node.inputs.map((source) => {
    const width = nodeWidth(index, source, trace),
      segment = { source, start: offset, width };
    offset += width;
    return segment;
  });
}

export interface BranchRole {
  input: string;
  /** Nearest common ancestor of all inputs of the combining node, if any. */
  fork: string | null;
  kind: 'identity' | 'linear' | 'nonlinear';
  dense: number;
  nonlinear: number;
  path: string[];
}

/**
 * Classify the branches entering an add/mean/concat node. With a shared fork this
 * separates a nonlinear head from a linear or identity skip connection.
 */
export function combineRoles(index: GraphIndex, nodeId: string): BranchRole[] {
  const n = index.nodes.get(nodeId);
  if (!n?.inputs.length) return [];
  const lineage = n.inputs.map((k) => ancestors(index, k, true));
  const common = lineage.reduce((acc, s) => new Set([...acc].filter((k) => s.has(k))));
  const fork =
    n.inputs.length > 1 && common.size
      ? [...common].sort((a, b) => index.rank.get(b)! - index.rank.get(a)!)[0]
      : null;
  const below = fork ? descendants(index, fork) : null;
  return n.inputs.map((input, i) => {
    const path = [...lineage[i]]
      .filter((k) => index.nodes.has(k) && (!below || below.has(k)))
      .sort((a, b) => index.rank.get(a)! - index.rank.get(b)!);
    const ops = path.map((k) => index.nodes.get(k)!);
    const dense = ops.filter((o) => o.op === 'dense').length,
      nonlinear = ops.filter(
        (o) =>
          (o.op === 'dense' && (o.activation === 'relu' || o.activation === 'tanh')) ||
          o.op === 'sigmoid',
      ).length;
    return {
      input,
      fork,
      kind: !path.length ? 'identity' : nonlinear ? 'nonlinear' : 'linear',
      dense,
      nonlinear,
      path,
    };
  });
}

/** Graph inputs a node ultimately reads. */
export function inputSources(index: GraphIndex, id: string) {
  const a = ancestors(index, id, true);
  return index.graph.inputs.filter((k) => a.has(k));
}

/** The node at the same structural position in another branch. */
export function counterpart(index: GraphIndex, fromRoot: string, toRoot: string, nodeId: string) {
  const dense = (root: string) =>
    branchSubgraph(index, root).nodes.filter((k) => index.nodes.get(k)!.op === 'dense');
  const a = dense(fromRoot),
    b = dense(toRoot),
    i = a.indexOf(nodeId);
  if (i >= 0 && a.length === b.length) return b[i];
  return b[0] ?? null;
}

export interface EnsembleSummary {
  id: string;
  members: { id: string; values: number[] }[];
  /** Combiner output as supplied in the trace. */
  values: number[];
  /** Arithmetic mean of the member traces, recomputed here. */
  recomputed: number[];
  maxError: number;
}

export function ensembleSummary(
  ensemble: Ensemble,
  trace: Record<string, ArrayLike<number>>,
): EnsembleSummary {
  const members = ensemble.members.map((id) => ({ id, values: Array.from(trace[id] ?? []) }));
  const width = Math.max(0, ...members.map((m) => m.values.length));
  const recomputed = Array.from(
    { length: width },
    (_, i) => members.reduce((a, m) => a + (m.values[i] ?? NaN), 0) / members.length,
  );
  const values = Array.from(trace[ensemble.id] ?? []);
  const maxError = Math.max(0, ...values.map((v, i) => Math.abs(v - recomputed[i])));
  return { id: ensemble.id, members, values, recomputed, maxError };
}

/** Strip the dotted prefix and suffix shared by every id, keeping the distinguishing part. */
export function distinctLabels(ids: string[]) {
  if (ids.length < 2) return ids.map((id) => id.split('.').pop() ?? id);
  const parts = ids.map((id) => id.split('.'));
  let pre = 0,
    post = 0;
  const shortest = Math.min(...parts.map((p) => p.length));
  while (pre < shortest - 1 && parts.every((p) => p[pre] === parts[0][pre])) pre++;
  while (
    post < shortest - pre - 1 &&
    parts.every((p) => p[p.length - 1 - post] === parts[0][parts[0].length - 1 - post])
  )
    post++;
  return parts.map((p) => p.slice(pre, p.length - post).join('.') || p.join('.'));
}

/** Shared dotted prefix of a set of ids (at segment boundaries). */
export function commonPrefix(ids: string[]) {
  if (ids.length < 2) return '';
  const parts = ids.map((id) => id.split('.'));
  let pre = 0;
  const shortest = Math.min(...parts.map((p) => p.length));
  while (pre < shortest - 1 && parts.every((p) => p[pre] === parts[0][pre])) pre++;
  return pre ? parts[0].slice(0, pre).join('.') + '.' : '';
}
