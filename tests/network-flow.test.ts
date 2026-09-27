import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forwardRow, seeded } from '../src/core/math';
import {
  indexGraph,
  primaryEnsemble,
  ensembles,
  branchRoots,
  branchSubgraph,
  branchTail,
  branchContaining,
  resolveBranch,
  flowColumns,
  combineRoles,
  denseContribution,
  splitTerms,
  denseEdges,
  combineEdges,
  concatSegments,
  counterpart,
  ensembleSummary,
  nodeWidth,
  inputSources,
  distinctLabels,
  commonPrefix,
} from '../src/core/network-flow';
import type { GraphNode, Manifest, ModelGraph } from '../src/core/types';

const model = (folder: string) =>
  (JSON.parse(readFileSync(`public/data/${folder}/manifest.json`, 'utf8')) as Manifest).model!;

/** Deterministic synthetic inputs of the widths the graph expects. */
function syntheticTrace(graph: ModelGraph, seed = 7) {
  const random = seeded(seed),
    inputs: Record<string, number[]> = {};
  for (const id of graph.inputs) {
    const reader = graph.nodes.find((n) => n.inputs.includes(id) && n.op === 'normalize');
    const width = reader?.mean?.length ?? graph.nodes.find((n) => n.inputs[0] === id)?.weight?.[0]?.length;
    assert.ok(width, 'input width for ' + id);
    inputs[id] = Array.from({ length: width! }, () => random() * 2 - 1);
  }
  return forwardRow(graph.nodes, inputs);
}

test('discovers the output ensemble, its members and each member branch', () => {
  const graph = model('collection'),
    index = indexGraph(graph);
  const primary = primaryEnsemble(index)!;
  assert.equal(primary.id, graph.output);
  assert.equal(primary.members.length, 3);
  const roots = branchRoots(index);
  assert.deepEqual(roots, primary.members);
  assert.equal(resolveBranch(index, ''), primary.members[0]);
  assert.equal(resolveBranch(index, primary.members[2]), primary.members[2]);
  assert.equal(resolveBranch(index, 'not-a-node'), primary.members[0]);
  for (const member of primary.members) {
    const sub = branchSubgraph(index, member),
      prefix = member.slice(0, member.lastIndexOf('.') + 1);
    assert.ok(sub.nodes.every((k) => k.startsWith(prefix)), 'no leakage from sibling members');
    assert.deepEqual(sub.sources, graph.inputs);
    assert.deepEqual(sub.collapsed, []);
    assert.equal(sub.nodes.at(-1), member);
    assert.deepEqual(branchTail(index, member), { nodes: [graph.output], feeds: [] });
  }
});

test('separates the nonlinear head from the linear residual at their fork', () => {
  const graph = model('collection'),
    index = indexGraph(graph);
  const add = graph.nodes.find((n) => n.op === 'add')!;
  const roles = combineRoles(index, add.id);
  const head = roles.find((r) => r.kind === 'nonlinear')!,
    skip = roles.find((r) => r.kind === 'linear')!;
  assert.ok(head && skip);
  assert.equal(head.fork, skip.fork);
  assert.equal(index.nodes.get(head.fork!)!.op, 'concat');
  assert.equal(skip.dense, 1);
  assert.ok(head.dense >= 2);
  // Parallel layers of equal depth share a column; the skip spans columns.
  const member = primaryEnsemble(index)!.members[0],
    sub = branchSubgraph(index, member),
    columns = flowColumns(index, sub, branchTail(index, member).nodes);
  const col = (id: string) => columns.findIndex((c) => c.includes(id));
  assert.equal(col(head.input), col(skip.input));
  assert.equal(col(skip.input) - col(skip.fork!), head.dense);
  assert.equal(col(graph.inputs[0]), 0);
  assert.deepEqual(columns.at(-1), [graph.output]);
  assert.equal(columns.flat().length, new Set(columns.flat()).size);
});

test('collapses nested ensembles and maps structural counterparts across members', () => {
  const graph = model('paired'),
    index = indexGraph(graph);
  const all = ensembles(index);
  assert.equal(all[0].id, graph.output);
  assert.ok(all.length >= 2, 'nested upstream ensemble found');
  const nested = all[1];
  const member = all[0].members[0],
    sub = branchSubgraph(index, member);
  assert.deepEqual(sub.collapsed, [nested.id]);
  assert.ok(!sub.nodes.some((k) => nested.members.includes(k)));
  assert.equal(sub.sources.length, graph.inputs.length);
  const roots = branchRoots(index);
  assert.deepEqual(roots.slice(0, all[0].members.length), all[0].members);
  for (const m of nested.members) assert.ok(roots.includes(m));
  // A layer inside the nested ensemble is found in its own member branch.
  const inner = branchSubgraph(index, nested.members[2]).nodes.find(
    (k) => index.nodes.get(k)!.op === 'dense',
  )!;
  assert.equal(branchContaining(index, inner, member), nested.members[2]);
  const tail = branchTail(index, nested.members[0]);
  assert.deepEqual(tail.nodes, [nested.id]);
  assert.ok(tail.feeds.length >= 1);
  // Counterparts keep the structural position.
  const dense0 = sub.nodes.filter((k) => index.nodes.get(k)!.op === 'dense'),
    other = all[0].members[2],
    dense2 = branchSubgraph(index, other).nodes.filter((k) => index.nodes.get(k)!.op === 'dense');
  dense0.forEach((k, i) => assert.equal(counterpart(index, member, other, k), dense2[i]));
  assert.equal(counterpart(index, member, nested.members[0], dense0[0]), branchSubgraph(index, nested.members[0]).nodes.find((k) => index.nodes.get(k)!.op === 'dense'));
  // Two encoders reading different inputs are labelled by their sources and line up.
  const join = sub.nodes.find(
    (k) => index.nodes.get(k)!.op === 'concat' && index.nodes.get(k)!.inputs.length === 2 && index.nodes.get(k)!.inputs.every((x) => index.nodes.has(x) && index.nodes.get(x)!.op === 'dense'),
  )!;
  const [a, b] = index.nodes.get(join)!.inputs;
  assert.notDeepEqual(inputSources(index, a), inputSources(index, b));
  const columns = flowColumns(index, sub);
  assert.equal(
    columns.findIndex((c) => c.includes(a)),
    columns.findIndex((c) => c.includes(b)),
  );
});

test('dense contributions reproduce the forward pass exactly and remainders are honest', () => {
  const graph = model('collection'),
    trace = syntheticTrace(graph),
    index = indexGraph(graph);
  for (const n of graph.nodes.filter((x) => x.op === 'dense')) {
    const input = trace[n.inputs[0]];
    n.weight!.forEach((w, i) => {
      const c = denseContribution(n, input, i);
      assert.equal(c.output, trace[n.id][i], `${n.id}[${i}] matches forwardRow bit for bit`);
      assert.equal(c.terms.length, w.length);
      for (let k = 1; k < c.terms.length; k++)
        assert.ok(Math.abs(c.terms[k - 1].value) >= Math.abs(c.terms[k].value));
      for (const t of c.terms) assert.equal(t.value, w[t.index] * input[t.index]);
      const split = splitTerms(c.terms, 3);
      assert.equal(split.shown.length, Math.min(3, w.length));
      assert.equal(split.hiddenCount, w.length - split.shown.length);
      assert.ok(Math.abs(split.shownSum + split.hiddenSum + c.bias - c.preactivation) < 1e-9);
    });
  }
  const summary = ensembleSummary(primaryEnsemble(index)!, trace);
  assert.equal(summary.maxError, 0);
  assert.equal(summary.members.length, 3);
});

test('edges carry signed w·x, not weights, with top-k and exact remainder per neuron', () => {
  const node: GraphNode = {
    id: 'h',
    op: 'dense',
    inputs: ['x'],
    weight: [
      [2, -1, 0.5, 0.1],
      [-3, 0, 1, 0],
    ],
    bias: [0.25, -1],
    activation: 'relu',
  };
  const x = [0.5, 2, -4, 1];
  const { edges, remainders } = denseEdges(node, x, 2, { focus: 1, focusCount: 3 });
  // Neuron 0 terms: 1, -2, -2, 0.1 -> ties broken by index.
  assert.deepEqual(
    edges.filter((e) => e.targetIndex === 0).map((e) => [e.sourceIndex, e.value]),
    [
      [1, -2],
      [2, -2],
    ],
  );
  assert.deepEqual(remainders[0], { targetIndex: 0, shown: 2, hidden: 2, hiddenSum: 1.1 });
  // A positive weight on a negative input is a negative edge.
  assert.ok(edges.some((e) => e.sourceIndex === 2 && e.targetIndex === 0 && e.value < 0));
  // The focused neuron gets more edges; its zero terms are still accounted for.
  assert.deepEqual(
    edges.filter((e) => e.targetIndex === 1).map((e) => e.value),
    [-4, -1.5, 0],
  );
  assert.deepEqual(remainders[1], { targetIndex: 1, shown: 3, hidden: 1, hiddenSum: 0 });
  const c = denseContribution(node, x, 0);
  assert.equal(c.preactivation, 0.25 + 1 - 2 - 2 + 0.1);
  assert.equal(c.output, 0);
  // Restricting targets (wide layers) only draws the selected neuron.
  assert.ok(denseEdges(node, x, 2, { targets: [1] }).edges.every((e) => e.targetIndex === 1));
});

test('traces an arbitrary DAG without ensembles, with an identity skip and two inputs', () => {
  const graph: ModelGraph = {
    id: 'toy',
    inputs: ['a', 'b'],
    output: 'p',
    nodes: [
      { id: 'h', op: 'dense', inputs: ['a'], weight: [[1, 0, -1], [0.5, 0.5, 0.5]], bias: [0, 0], activation: 'relu' },
      { id: 'c', op: 'concat', inputs: ['h', 'b'] },
      { id: 'd', op: 'dense', inputs: ['c'], weight: [[1, -1, 2, 0], [0, 1, 0, -2]], bias: [0.1, 0] },
      { id: 's', op: 'add', inputs: ['d', 'b'] },
      { id: 'p', op: 'sigmoid', inputs: ['s'] },
    ],
  };
  const index = indexGraph(graph);
  assert.equal(primaryEnsemble(index), null);
  assert.deepEqual(branchRoots(index), ['p']);
  const sub = branchSubgraph(index, 'p');
  assert.deepEqual(sub.nodes, ['h', 'c', 'd', 's', 'p']);
  assert.deepEqual(sub.sources, ['a', 'b']);
  assert.deepEqual(branchTail(index, 'p'), { nodes: [], feeds: [] });
  assert.deepEqual(flowColumns(index, sub), [['a'], ['b', 'h'], ['c'], ['d'], ['s'], ['p']]);
  const roles = combineRoles(index, 's');
  assert.equal(roles[0].fork, 'b');
  assert.equal(roles[0].kind, 'linear');
  assert.deepEqual(roles[0].path, ['c', 'd']);
  assert.equal(roles[1].kind, 'identity');
  const trace = forwardRow(graph.nodes, { a: [1, 2, 3], b: [-1, 0.5] });
  assert.equal(nodeWidth(index, 'c', trace), 4);
  assert.equal(nodeWidth(index, 'd', {}), 2);
  assert.deepEqual(concatSegments(index, index.nodes.get('c')!, trace), [
    { source: 'h', start: 0, width: 2 },
    { source: 'b', start: 2, width: 2 },
  ]);
  const add = combineEdges(index.nodes.get('s')!, trace);
  assert.deepEqual(
    add.filter((e) => e.source === 'b').map((e) => e.value),
    [-1, 0.5],
  );
  assert.throws(() => indexGraph({ ...graph, nodes: [...graph.nodes, { id: 'q', op: 'sigmoid', inputs: ['zzz'] }] }));
  assert.throws(() =>
    indexGraph({
      ...graph,
      nodes: [
        { id: 'x', op: 'sigmoid', inputs: ['y'] },
        { id: 'y', op: 'sigmoid', inputs: ['x'] },
      ],
    }),
  );
});

test('finds an ensemble behind a final nonlinearity and follows the tail to the output', () => {
  const dense = (id: string, w: number): GraphNode => ({
    id,
    op: 'dense',
    inputs: ['x'],
    weight: [[w, -w]],
    bias: [0],
  });
  const graph: ModelGraph = {
    id: 'logit-mean',
    inputs: ['x'],
    output: 'p',
    nodes: [
      dense('m.a.logit', 1),
      dense('m.b.logit', -2),
      dense('m.c.logit', 0.5),
      { id: 'm', op: 'mean', inputs: ['m.a.logit', 'm.b.logit', 'm.c.logit'] },
      { id: 'p', op: 'sigmoid', inputs: ['m'] },
    ],
  };
  const index = indexGraph(graph);
  assert.deepEqual(primaryEnsemble(index), { id: 'm', members: ['m.a.logit', 'm.b.logit', 'm.c.logit'] });
  assert.deepEqual(branchRoots(index), ['m.a.logit', 'm.b.logit', 'm.c.logit', 'p']);
  assert.deepEqual(branchTail(index, 'm.b.logit'), { nodes: ['m', 'p'], feeds: [] });
  assert.deepEqual(branchSubgraph(index, 'p').collapsed, ['m']);
  const trace = forwardRow(graph.nodes, { x: [0.3, 0.9] });
  const mean = combineEdges(index.nodes.get('m')!, trace);
  assert.ok(Math.abs(mean.reduce((s, e) => s + e.value, 0) - trace.m[0]) < 1e-12);
  assert.deepEqual(distinctLabels(['m.a.logit', 'm.b.logit', 'm.c.logit']), ['a', 'b', 'c']);
  assert.equal(commonPrefix(['m.a.logit', 'm.a.x']), 'm.a.');
});
