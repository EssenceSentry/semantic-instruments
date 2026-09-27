import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forwardRow, seeded } from '../src/core/math';
import { branchRoots, indexGraph, primaryEnsemble, resolveBranch } from '../src/core/network-flow';
import {
  BODY_TOP,
  CAPTION,
  DOT_LIMIT,
  FOCUS_TERMS,
  HEIGHT,
  MIN_WIDTH,
  READOUT_TERMS,
  buildView,
  clampIndex,
  curve,
  denseItems,
  denseReadout,
  ensemblePanel,
  flowEdges,
  layout,
  memberName,
  truncate,
  yOf,
  type Item,
} from '../src/components/network-layout';
import type { Manifest, ModelGraph } from '../src/core/types';

const model = (folder: string) =>
  (JSON.parse(readFileSync(`public/data/${folder}/manifest.json`, 'utf8')) as Manifest).model!;

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

function scene(folder: string, branch = '') {
  const graph = model(folder),
    index = indexGraph(graph),
    trace = syntheticTrace(graph),
    root = resolveBranch(index, branch),
    view = buildView(index, root, trace);
  return { graph, index, trace, root, view, geometry: layout(index, view, trace) };
}

test('small helpers keep their exact formatting and clamping', () => {
  assert.equal(clampIndex(-3, 5), 0);
  assert.equal(clampIndex(9, 5), 4);
  assert.equal(clampIndex(2, 0), 0);
  assert.equal(truncate('abcdef', 4), 'abc…');
  assert.equal(truncate('abc', 4), 'abc');
  assert.equal(memberName('2'), 'member 2');
  assert.equal(memberName('head'), 'head');
  assert.equal(memberName(undefined), 'member');
  assert.equal(curve(0, 10, 100, 20), 'M0,10 C48,10 52,20 100,20');
  const item = { width: 4, top: 100, h: 40 } as Item;
  assert.deepEqual([0, 1, 3, 9].map((j) => yOf(item, j)), [105, 115, 135, 135]);
});

test('every branch lays out inside the drawing with one x per column', () => {
  for (const folder of ['collection', 'paired']) {
    const index = indexGraph(model(folder)),
      trace = syntheticTrace(model(folder));
    for (const root of branchRoots(index)) {
      const view = buildView(index, root, trace),
        { items, width, height } = layout(index, view, trace);
      assert.ok(width >= MIN_WIDTH && height >= HEIGHT);
      const xs = new Map<number, number>();
      for (const it of items.values()) {
        assert.ok(it.top >= BODY_TOP + CAPTION - 1e-9, `${root}: ${it.id} below the header band`);
        assert.ok(it.top + it.h <= height, `${root}: ${it.id} inside the drawing`);
        assert.ok(it.x > 0 && it.x < width);
        assert.equal(it.mode, it.width > DOT_LIMIT ? 'strip' : 'dots');
        if (xs.has(it.column)) assert.equal(xs.get(it.column), it.x);
        xs.set(it.column, it.x);
      }
      const ordered = [...xs.entries()].sort((a, b) => a[0] - b[0]).map(([, x]) => x);
      assert.ok(ordered.every((x, i) => i === 0 || x > ordered[i - 1]), 'columns advance left to right');
    }
  }
});

test('ghost members sit beside the root and point at their own branches', () => {
  const { index, view, geometry, root } = scene('collection');
  const members = primaryEnsemble(index)!.members;
  const ghosts = [...geometry.items.values()].filter((it) => it.kind === 'ghost');
  assert.deepEqual(ghosts.map((g) => g.id).sort(), members.filter((m) => m !== root).sort());
  assert.ok(ghosts.every((g) => g.column === geometry.items.get(root)!.column && g.caption === 'member'));
  assert.ok(view.anatomy.includes(`mean of ${members.length}`));
});

test('edges focus on the selected neuron and are drawn last', () => {
  const { index, trace, geometry } = scene('collection');
  const dense = denseItems(index, geometry.items);
  assert.ok(dense.length >= 2);
  assert.ok(dense.every((it, i) => i === 0 || it.x >= dense[i - 1].x));
  const target = dense[0],
    coordinate = 1;
  const { weighted, ribbons, footers } = flowEdges(index, geometry.items, trace, target.id, coordinate);
  const focus = weighted.filter((w) => w.focus);
  assert.ok(focus.length > 0 && focus.length <= FOCUS_TERMS);
  assert.ok(focus.every((w) => w.edge.target === target.id && w.edge.targetIndex === coordinate));
  assert.ok(weighted.slice(weighted.length - focus.length).every((w) => w.focus));
  assert.ok(weighted.every((w) => Math.abs(w.edge.value) <= w.scale + 1e-12));
  assert.equal(new Set(ribbons.map((r) => r.key)).size, ribbons.length);
  assert.ok(footers.has(target.column));
});

test('the readout reproduces the traced activation and the panel the ensemble mean', () => {
  const { graph, index, trace, view, geometry } = scene('collection');
  const target = denseItems(index, geometry.items)[0];
  const readout = denseReadout(index, target.id, 10_000, trace)!;
  assert.equal(readout.c, target.width - 1);
  assert.ok(readout.split.shown.length <= READOUT_TERMS);
  assert.ok(Math.abs(readout.contribution.output - readout.traced!) < 1e-9);
  assert.equal(denseReadout(index, graph.inputs[0], 0, trace), null);
  const panel = ensemblePanel(graph, view, trace)!;
  assert.equal(panel.summary.members.length, view.ensemble!.members.length);
  assert.equal(panel.baseSummary, null);
  assert.ok(panel.summary.maxError < 1e-9);
  assert.ok(panel.scale >= Math.max(...panel.summary.values.map(Math.abs)));
});
