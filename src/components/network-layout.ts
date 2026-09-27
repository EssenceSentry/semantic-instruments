import type { GraphNode, ModelGraph } from '../core/types';
import {
  branchSubgraph,
  branchTail,
  combineEdges,
  combineRoles,
  commonPrefix,
  concatSegments,
  denseContribution,
  denseEdges,
  distinctLabels,
  ensembleSummary,
  flowColumns,
  inputSources,
  isCombiner,
  nodeWidth,
  primaryEnsemble,
  splitTerms,
  type FlowEdge,
  type GraphIndex,
} from '../core/network-flow';

/** Pure view, layout and edge geometry for the NetworkFlow component (no JSX). */

export type Kind = 'source' | 'collapsed' | 'node' | 'ghost';
export interface Item {
  id: string;
  kind: Kind;
  column: number;
  width: number;
  mode: 'dots' | 'strip';
  label: string;
  caption: string;
  role?: string;
  x: number;
  top: number;
  h: number;
}

export const HEIGHT = 340,
  BODY_TOP = 34,
  BODY_BOTTOM = 304,
  CAPTION = 25,
  ROLE = 12,
  GAP = 10,
  MIN_WIDTH = 950,
  DOT_LIMIT = 32,
  PER_NEURON = 3,
  FOCUS_TERMS = 8,
  READOUT_TERMS = 4;

export const clampIndex = (i: number, width: number) =>
  Math.max(0, Math.min(Math.max(0, width - 1), i));
export const sign = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
const OP_GLYPH: Record<GraphNode['op'], string> = {
  normalize: 'standardize',
  dense: '',
  concat: 'concat',
  add: 'add',
  mean: 'mean',
  sigmoid: 'σ',
};

export function caption(
  index: GraphIndex,
  id: string,
  width: number,
  trace: Record<string, number[]>,
) {
  const n = index.nodes.get(id);
  if (!n) return `input · ${width}`;
  if (isCombiner(n)) return `mean of ${n.inputs.length}`;
  if (n.op === 'dense') {
    const act = n.activation ?? 'linear',
      zeros = act === 'relu' ? (trace[id] ?? []).filter((v) => v === 0).length : 0;
    return `${width} · ${act}${zeros ? ` · ${zeros} zero` : ''}`;
  }
  if (n.op === 'concat') return `concat · ${width}`;
  return `${OP_GLYPH[n.op]}${width > 1 ? ' · ' + width : ''}`;
}

/** Structure of one branch view, derived entirely from graph connectivity. */
export function buildView(index: GraphIndex, root: string, trace: Record<string, number[]>) {
  const sub = branchSubgraph(index, root),
    tail = branchTail(index, root),
    columns = flowColumns(index, sub, tail.nodes);
  const primary = primaryEnsemble(index);
  const combiner = tail.nodes.find((k) => isCombiner(index.nodes.get(k)));
  const ensemble = combiner
    ? { id: combiner, members: [...index.nodes.get(combiner)!.inputs] }
    : root === index.graph.output && primary
      ? primary
      : null;
  // Strip the root's dotted namespace (e.g. "model.2.") from the ids that share it.
  const prefix = root.includes('.')
    ? root.slice(0, root.lastIndexOf('.') + 1)
    : commonPrefix(sub.nodes);
  const label = (id: string) => {
    const n = index.nodes.get(id);
    if (n?.name) return n.name;
    return prefix && id.startsWith(prefix) && id.length > prefix.length
      ? id.slice(prefix.length)
      : id;
  };
  // Annotate the branches entering every multi-input add/concat in view.
  const roles = new Map<string, string>();
  for (const id of sub.nodes) {
    const n = index.nodes.get(id)!;
    if (n.inputs.length < 2) continue;
    if (n.op === 'add') {
      for (const r of combineRoles(index, id))
        roles.set(
          r.input,
          r.kind === 'identity'
            ? 'identity skip'
            : r.kind === 'linear'
              ? `linear ${r.dense === 1 ? 'skip' : 'path · ' + r.dense + ' dense'}`
              : `nonlinear · ${r.dense} dense`,
        );
    } else if (n.op === 'concat') {
      const sources = n.inputs.map((k) => inputSources(index, k));
      if (new Set(sources.map((s) => s.join('|'))).size > 1)
        n.inputs.forEach((k, i) => roles.set(k, '← ' + sources[i].join(' + ')));
    }
  }
  const anatomy: string[] = [];
  if (sub.sources.length > 1 || sub.collapsed.length)
    anatomy.push(`${sub.sources.length + sub.collapsed.length} inputs`);
  for (const id of sub.nodes) {
    const n = index.nodes.get(id)!;
    if (n.op !== 'add' || n.inputs.length < 2) continue;
    const rs = combineRoles(index, id);
    anatomy.push(
      rs
        .map((r) =>
          r.kind === 'nonlinear'
            ? `nonlinear head (${r.dense} dense)`
            : r.kind === 'linear'
              ? `linear residual (${r.dense} dense)`
              : 'identity skip',
        )
        .join(' + '),
    );
  }
  if (ensemble) anatomy.push(`mean of ${ensemble.members.length}`);
  return { sub, tail, columns, ensemble, label, roles, anatomy, primary };
}
export type FlowView = ReturnType<typeof buildView>;

export function layout(index: GraphIndex, view: FlowView, trace: Record<string, number[]>) {
  const items = new Map<string, Item>();
  const rootColumn = view.columns.findIndex((c) => c.includes(view.sub.root));
  const ghosts =
    view.tail.nodes.length && view.ensemble
      ? view.ensemble.members.filter((m) => m !== view.sub.root)
      : [];
  const columns = view.columns.map((c, i) => (i === rootColumn ? [...c, ...ghosts] : [...c]));
  const memberLabels = view.ensemble ? distinctLabels(view.ensemble.members) : [];
  columns.forEach((ids, column) =>
    ids.forEach((id) => {
      const kind: Kind = ghosts.includes(id)
        ? 'ghost'
        : view.sub.sources.includes(id)
          ? 'source'
          : view.sub.collapsed.includes(id)
            ? 'collapsed'
            : 'node';
      const width = nodeWidth(index, id, trace);
      const memberIndex = view.ensemble?.members.indexOf(id) ?? -1;
      items.set(id, {
        id,
        kind,
        column,
        width,
        mode: width > DOT_LIMIT ? 'strip' : 'dots',
        label: kind === 'ghost' ? memberName(memberLabels[memberIndex]) : view.label(id),
        caption: kind === 'ghost' ? 'member' : caption(index, id, width, trace),
        role: view.roles.get(id),
        x: 0,
        top: 0,
        h: 0,
      });
    }),
  );
  // Horizontal rhythm: vector columns breathe more than scalar operator columns.
  const wide = columns.map((ids) => ids.some((id) => items.get(id)!.width > 1));
  const gaps = columns.slice(1).map((_, i) => (wide[i] || wide[i + 1] ? 94 : 112));
  const left = 44,
    right = 96,
    raw = gaps.reduce((a, b) => a + b, 0);
  const stretch = raw ? Math.min(2.1, Math.max(1, (MIN_WIDTH - left - right) / raw)) : 1;
  const used = left + right + raw * stretch,
    width = Math.max(MIN_WIDTH, Math.ceil(used)),
    offset = (width - used) / 2;
  let x = left + offset;
  columns.forEach((ids, c) => {
    ids.forEach((id) => (items.get(id)!.x = x));
    x += (gaps[c] ?? 0) * stretch;
  });
  // Vertical packing from the output backwards: each block seeks its consumers.
  const center = new Map<string, number>(),
    mid = (BODY_TOP + BODY_BOTTOM) / 2;
  let bottom = BODY_BOTTOM;
  for (let c = columns.length - 1; c >= 0; c--) {
    const col = columns[c].map((id) => items.get(id)!);
    const demand = col.map((it) =>
      it.mode === 'strip'
        ? it.kind === 'ghost'
          ? 36
          : 150
        : Math.max(1, it.width) * (it.kind === 'ghost' ? 11 : 17),
    );
    const fixed =
      col.reduce((a, it) => a + CAPTION + (it.role ? ROLE : 0), 0) + GAP * (col.length - 1);
    const scale = Math.min(1, (BODY_BOTTOM - BODY_TOP - fixed) / demand.reduce((a, b) => a + b, 0));
    col.forEach((it, i) => (it.h = Math.max(it.width > 1 ? 18 : 10, demand[i] * scale)));
    const consumerOf = (id: string) =>
      items.get(id)!.kind === 'ghost'
        ? view.tail.nodes.slice(0, 1)
        : (index.consumers.get(id) ?? []);
    const desired = col.map((item) => {
      const cs = consumerOf(item.id).filter((k) => center.has(k));
      return cs.length ? cs.reduce((a, k) => a + center.get(k)!, 0) / cs.length : mid;
    });
    const slot = (item: Item) => {
      const cs = consumerOf(item.id).filter((k) => items.has(k));
      const inputs = cs.length ? (index.nodes.get(cs[0])?.inputs ?? []) : [];
      return [inputs.indexOf(item.id), index.rank.get(item.id) ?? 0];
    };
    const order = col
      .map((item, i) => ({ item, want: desired[i], slot: slot(item) }))
      .sort((a, b) => a.want - b.want || a.slot[0] - b.slot[0] || a.slot[1] - b.slot[1]);
    const full = (item: Item) => CAPTION + item.h + (item.role ? ROLE : 0);
    const total = order.reduce((a, o) => a + full(o.item), 0) + GAP * (order.length - 1);
    // Centre the stack on the mean desired position, then clamp to the body.
    const meanWant = order.reduce((a, o) => a + o.want, 0) / order.length;
    let t = Math.max(BODY_TOP, Math.min(BODY_BOTTOM - total, meanWant - total / 2));
    if (order.length === 1)
      t = Math.max(
        BODY_TOP,
        Math.min(BODY_BOTTOM - total, order[0].want - CAPTION - order[0].item.h / 2),
      );
    for (const o of order) {
      o.item.top = t + CAPTION;
      center.set(o.item.id, o.item.top + o.item.h / 2);
      t += full(o.item) + GAP;
    }
    bottom = Math.max(bottom, t - GAP);
  }
  return { items, width, height: Math.max(HEIGHT, bottom + 40) };
}

export const truncate = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

export function memberName(label: string | undefined) {
  if (label === undefined) return 'member';
  return /^\d+$/.test(label) ? 'member ' + label : label;
}

/** Vertical position of coordinate j inside an item. */
export function yOf(item: Item, j: number) {
  const n = Math.max(1, item.width);
  return item.top + (item.h * (Math.min(j, n - 1) + 0.5)) / n;
}
export function radius(item: Item) {
  if (item.width <= 1) return item.kind === 'ghost' ? 5 : 7;
  return Math.max(2, Math.min(6.2, (item.h / item.width) * 0.36));
}
export const half = (item: Item) => (item.mode === 'strip' ? 4 : radius(item));

export function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = (x2 - x1) * 0.48;
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
}
export function ribbon(s: Item, t: Item, t0: number, t1: number) {
  const x1 = s.x + half(s),
    x2 = t.x - half(t),
    dx = (x2 - x1) * 0.48,
    s0 = s.top,
    s1 = s.top + s.h;
  return `M${x1},${s0} C${x1 + dx},${s0} ${x2 - dx},${t0} ${x2},${t0} L${x2},${t1} C${x2 - dx},${t1} ${x1 + dx},${s1} ${x1},${s1} Z`;
}

export interface WeightedEdge {
  edge: FlowEdge;
  focus: boolean;
  scale: number;
}
export interface ColumnFooter {
  shown: number;
  of: Set<number>;
  wide: boolean;
}

/** Edges: dense layers carry w·x; add/mean carry their additive terms; the rest are identity ribbons. */
export function flowEdges(
  index: GraphIndex,
  items: Map<string, Item>,
  trace: Record<string, number[]>,
  selectedNodeId: string,
  coordinate: number,
) {
  const weighted: WeightedEdge[] = [];
  const ribbons: { d: string; key: string }[] = [];
  const footers = new Map<number, ColumnFooter>();
  for (const it of items.values()) {
    const n = index.nodes.get(it.id);
    if (!n || it.kind === 'source' || it.kind === 'ghost' || it.kind === 'collapsed') continue;
    if (n.op === 'dense') {
      const src = items.get(n.inputs[0]);
      if (!src) continue;
      const input = trace[n.inputs[0]] ?? [];
      const focus = it.id === selectedNodeId ? clampIndex(coordinate, it.width) : undefined;
      const targets = it.mode === 'dots' ? undefined : focus === undefined ? [] : [focus];
      const { edges } = denseEdges(n, input, PER_NEURON, {
        targets,
        focus,
        focusCount: FOCUS_TERMS,
      });
      const scale = Math.max(1e-12, ...edges.map((e) => Math.abs(e.value)));
      edges.forEach((edge) => weighted.push({ edge, focus: edge.targetIndex === focus, scale }));
      const f = footers.get(it.column) ?? { shown: PER_NEURON, of: new Set<number>(), wide: false };
      f.of.add(n.weight?.[0]?.length ?? 0);
      f.wide ||= it.mode === 'strip';
      footers.set(it.column, f);
    } else if ((n.op === 'add' || n.op === 'mean') && it.width <= DOT_LIMIT) {
      const edges = combineEdges(n, trace).filter((e) => items.has(e.source));
      const scale = Math.max(1e-12, ...edges.map((e) => Math.abs(e.value)));
      edges.forEach((edge) => weighted.push({ edge, focus: false, scale }));
    } else if (n.op === 'concat') {
      for (const seg of concatSegments(index, n, trace)) {
        const src = items.get(seg.source);
        if (!src || !seg.width) continue;
        const t0 = it.top + (it.h * seg.start) / Math.max(1, it.width),
          t1 = it.top + (it.h * (seg.start + seg.width)) / Math.max(1, it.width);
        ribbons.push({ d: ribbon(src, it, t0, t1), key: seg.source + '>' + it.id });
      }
    } else
      for (const k of n.inputs) {
        const src = items.get(k);
        if (src) ribbons.push({ d: ribbon(src, it, it.top, it.top + it.h), key: k + '>' + it.id });
      }
  }
  weighted.sort((a, b) => Number(a.focus) - Number(b.focus));
  const hiddenInputs = [...footers.values()].some((f) => [...f.of].some((w) => w > PER_NEURON));
  return { weighted, ribbons, footers, hiddenInputs };
}

/** Dense items in view, ordered left to right then top to bottom for keyboard travel. */
export function denseItems(index: GraphIndex, items: Map<string, Item>) {
  return [...items.values()]
    .filter((it) => it.kind === 'node' && index.nodes.get(it.id)?.op === 'dense')
    .sort((a, b) => a.x - b.x || a.top - b.top);
}

/** Exact w·x decomposition of the selected dense neuron, or null when no dense layer is selected. */
export function denseReadout(
  index: GraphIndex,
  selectedNodeId: string,
  coordinate: number,
  trace: Record<string, number[]>,
  baselineTrace?: Record<string, number[]>,
) {
  const selectedNode = index.nodes.get(selectedNodeId);
  if (selectedNode?.op !== 'dense') return null;
  const c = clampIndex(coordinate, selectedNode.weight?.length ?? 0);
  const contribution = denseContribution(selectedNode, trace[selectedNode.inputs[0]] ?? [], c);
  const split = splitTerms(contribution.terms, READOUT_TERMS);
  const traced = trace[selectedNodeId]?.[c];
  const base = baselineTrace?.[selectedNodeId]?.[c];
  return { c, contribution, split, traced, base };
}

/** Member values and display scale of the ensemble the view belongs to, or null without one. */
export function ensemblePanel(
  graph: ModelGraph,
  view: FlowView,
  trace: Record<string, number[]>,
  baselineTrace?: Record<string, number[]>,
) {
  const ensemble = view.ensemble;
  if (!ensemble) return null;
  const summary = ensembleSummary(ensemble, trace);
  const baseSummary = baselineTrace ? ensembleSummary(ensemble, baselineTrace) : null;
  const memberLabels = distinctLabels(ensemble.members).map(memberName);
  const probability =
    summary.values.length === 1 &&
    graph.kind !== 'vector' &&
    [...summary.members.flatMap((m) => m.values), ...summary.values].every((v) => v >= 0 && v <= 1);
  const scale = Math.max(
    1e-12,
    ...summary.members.map((m) =>
      m.values.length === 1 ? Math.abs(m.values[0]) : Math.hypot(...m.values),
    ),
    summary.values.length === 1 ? Math.abs(summary.values[0]) : Math.hypot(...summary.values),
  );
  const primary = view.primary;
  const nested = !!primary && ensemble.id !== primary.id;
  const threshold =
    summary.values.length === 1 && graph.threshold !== undefined && summary.id === graph.output
      ? graph.threshold
      : undefined;
  return {
    ensemble,
    primary,
    summary,
    baseSummary,
    memberLabels,
    probability,
    scale,
    nested,
    threshold,
  };
}
export type EnsemblePanel = NonNullable<ReturnType<typeof ensemblePanel>>;
