import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { ArrowUpLeft } from 'lucide-react';
import type { ModelGraph } from '../core/types';
import { useToolState } from '../core/context';
import {
  branchContaining,
  branchRoots,
  counterpart,
  indexGraph,
  nodeWidth,
  resolveBranch,
} from '../core/network-flow';
import {
  FOCUS_TERMS,
  PER_NEURON,
  buildView,
  clampIndex,
  curve,
  denseItems,
  denseReadout,
  ensemblePanel,
  flowEdges,
  half,
  layout,
  radius,
  sign,
  truncate,
  yOf,
  type EnsemblePanel,
  type Item,
} from './network-layout';
import { fmt } from './Shared';
import './network-flow.css';

interface Props {
  graph: ModelGraph;
  trace: Record<string, number[]>;
  baselineTrace?: Record<string, number[]>;
  selectedNodeId: string;
  coordinate: number;
  onInspect: (nodeId: string, coordinate: number) => void;
}

const signed = (x: number, d = 3) =>
  Number.isFinite(x) ? (x < 0 ? '−' : '+') + fmt(Math.abs(x), d) : '—';

export function NetworkFlow({
  graph,
  trace,
  baselineTrace,
  selectedNodeId,
  coordinate,
  onInspect,
}: Props) {
  const [branch, setBranch] = useToolState('networkFlow.branch', '');
  const built = useMemo(() => {
    try {
      return { index: indexGraph(graph), error: '' };
    } catch (e) {
      return { index: null, error: (e as Error).message };
    }
  }, [graph]);
  const index = built.index;
  const root = index ? resolveBranch(index, branch) : '';
  const view = useMemo(() => (index ? buildView(index, root, trace) : null), [index, root, trace]);
  const geometry = useMemo(
    () => (index && view ? layout(index, view, trace) : null),
    [index, view, trace],
  );
  const roots = useMemo(() => (index ? branchRoots(index) : []), [index]);
  const svgRef = useRef<SVGSVGElement>(null),
    pendingFocus = useRef<string | null>(null),
    lastSelected = useRef<string | null>(null);

  // Follow the parent when it selects a layer that lives in another branch.
  useEffect(() => {
    if (!index || !view || lastSelected.current === selectedNodeId) return;
    lastSelected.current = selectedNodeId;
    if (view.sub.nodes.includes(selectedNodeId)) return;
    const other = branchContaining(index, selectedNodeId, root);
    if (other && other !== root) setBranch(other);
  }, [index, view, root, selectedNodeId, setBranch]);

  useEffect(() => {
    if (!pendingFocus.current || !svgRef.current) return;
    const key = pendingFocus.current;
    pendingFocus.current = null;
    const el = [...svgRef.current.querySelectorAll<SVGElement>('[data-nf-key]')].find(
      (e) => e.dataset.nfKey === key,
    );
    el?.focus();
  });

  if (!index || !view || !geometry)
    return (
      <div className="nf nf-error" data-capture="network.flow">
        The model graph cannot be traced: {built.error}
      </div>
    );

  const { items, width: W, height: H } = geometry;
  const widthOf = (id: string) => nodeWidth(index, id, trace);
  const inspect = (id: string, i: number, focus = false) => {
    const c = clampIndex(i, widthOf(id));
    if (focus) pendingFocus.current = items.get(id)?.mode === 'strip' ? id : `${id}:${c}`;
    onInspect(id, c);
  };
  const switchTo = (member: string) => {
    if (!roots.includes(member)) return;
    setBranch(member);
    const from = view.sub.nodes.includes(selectedNodeId) ? selectedNodeId : '';
    const target = counterpart(index, root, member, from);
    if (target) onInspect(target, clampIndex(coordinate, widthOf(target)));
  };
  const denseInView = denseItems(index, items);
  const onNeuronKey = (e: KeyboardEvent, id: string, i: number) => {
    const n = widthOf(id),
      at = denseInView.findIndex((it) => it.id === id);
    const moves: Record<string, () => void> = {
      Enter: () => inspect(id, i, true),
      ' ': () => inspect(id, i, true),
      ArrowUp: () => inspect(id, i - 1, true),
      ArrowDown: () => inspect(id, i + 1, true),
      PageUp: () => inspect(id, i - 10, true),
      PageDown: () => inspect(id, i + 10, true),
      Home: () => inspect(id, 0, true),
      End: () => inspect(id, n - 1, true),
      ArrowLeft: () => at > 0 && inspect(denseInView[at - 1].id, i, true),
      ArrowRight: () => at < denseInView.length - 1 && inspect(denseInView[at + 1].id, i, true),
    };
    if (moves[e.key]) {
      e.preventDefault();
      moves[e.key]();
    }
  };
  const activate = (e: KeyboardEvent, run: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      run();
    }
  };

  const { weighted, ribbons, footers, hiddenInputs } = flowEdges(
    index,
    items,
    trace,
    selectedNodeId,
    coordinate,
  );
  const readout = denseReadout(index, selectedNodeId, coordinate, trace, baselineTrace);
  const panel = ensemblePanel(graph, view, trace, baselineTrace);

  const renderItem = (it: Item) => {
    const values = trace[it.id] ?? [],
      base = baselineTrace?.[it.id];
    const max = Math.max(1e-12, ...values.map(Math.abs));
    const n = index.nodes.get(it.id);
    const dense = it.kind === 'node' && n?.op === 'dense';
    const selectedHere = it.id === selectedNodeId;
    const sel = clampIndex(coordinate, it.width);
    const clickable = dense || it.kind === 'ghost' || it.kind === 'collapsed';
    const header = (
      <text textAnchor="middle" className={'nf-label' + (it.kind === 'ghost' ? ' ghost' : '')}>
        <title>{it.id}</title>
        <tspan x={it.x} y={it.top - 16} className="nf-label-name">
          {truncate(it.label, 18)}
        </tspan>
        <tspan x={it.x} y={it.top - 6} className="nf-label-shape">
          {truncate(it.caption, 20)}
        </tspan>
      </text>
    );
    const role = it.role && (
      <text x={it.x} y={it.top + it.h + 11} textAnchor="middle" className="nf-role">
        {it.role}
      </text>
    );
    if (it.mode === 'strip') {
      const cells = values.map((v, j) => (
        <rect
          key={j}
          x={it.x - 4}
          y={it.top + (it.h * j) / it.width}
          width={8}
          height={Math.max(0.35, it.h / it.width)}
          className={'nf-cell ' + sign(v)}
          fillOpacity={0.18 + 0.82 * (Math.abs(v) / max)}
        />
      ));
      const strip = (
        <>
          <rect
            x={it.x - 5}
            y={it.top - 1}
            width={10}
            height={it.h + 2}
            rx={2}
            className="nf-strip-frame"
          />
          {cells}
          {selectedHere && dense && (
            <g className="nf-strip-marker">
              <rect x={it.x - 7} y={yOf(it, sel) - 2.5} width={14} height={5} rx={1.5} />
              <text x={it.x - 11} y={yOf(it, sel) + 3} textAnchor="end" className="nf-value strong">
                {`[${sel}] ${fmt(values[sel] ?? NaN)}`}
              </text>
            </g>
          )}
        </>
      );
      if (!clickable)
        return (
          <g key={it.id}>
            {header}
            {strip}
            {role}
          </g>
        );
      const pick = (e: MouseEvent<SVGGElement>) => {
        if (!dense) return;
        const r = (
          e.currentTarget.querySelector('.nf-strip-frame') as SVGRectElement
        ).getBoundingClientRect();
        inspect(it.id, Math.floor(((e.clientY - r.top) / Math.max(1, r.height)) * it.width));
      };
      return (
        <g key={it.id}>
          {header}
          <g
            className="nf-hit"
            role="button"
            tabIndex={0}
            data-nf-key={it.id}
            aria-label={
              dense
                ? `${it.label}, ${it.width} neurons. Click a position or use arrow keys to inspect a neuron.`
                : `Open ${it.label}`
            }
            onClick={
              dense
                ? pick
                : () => it.kind === 'collapsed' && switchTo(index.nodes.get(it.id)!.inputs[0])
            }
            onKeyDown={(e) =>
              dense
                ? onNeuronKey(e, it.id, selectedHere ? sel : 0)
                : activate(e, () => switchTo(index.nodes.get(it.id)!.inputs[0]))
            }
          >
            <rect x={it.x - 12} y={it.top - 2} width={24} height={it.h + 4} fill="transparent" />
            {strip}
          </g>
          {role}
        </g>
      );
    }
    const r = radius(it);
    const neurons = Array.from({ length: Math.max(1, it.width) }, (_, j) => {
      const v = values[j] ?? NaN,
        y = yOf(it, j),
        on = selectedHere && dense && j === sel;
      const changed = base && Number.isFinite(base[j]) && Math.abs(base[j] - v) > 1e-9;
      const tip = `${it.id}[${j}] = ${fmt(v, 4)}${changed ? ` (baseline ${fmt(base![j], 4)})` : ''}`;
      const dot = (
        <>
          {on && <circle cx={it.x} cy={y} r={r + 5} className="nf-halo" />}
          <circle
            cx={it.x}
            cy={y}
            r={on ? r + 1.5 : r}
            className={
              'nf-neuron ' +
              sign(v) +
              (on ? ' selected' : '') +
              (it.kind === 'ghost' ? ' ghost' : '')
            }
            fillOpacity={v === 0 || !Number.isFinite(v) ? 1 : 0.28 + 0.72 * (Math.abs(v) / max)}
          />
          {changed && <circle cx={it.x} cy={y} r={r + 2.6} className="nf-changed" />}
          {it.width === 1 && (
            <text
              x={it.x + r + 6}
              y={y + 3.5}
              className={'nf-value' + (it.kind === 'node' ? ' strong' : '')}
            >
              {fmt(v)}
            </text>
          )}
          {on && it.width > 1 && (
            <text x={it.x - r - 7} y={y + 3.5} textAnchor="end" className="nf-value strong">
              {`[${j}] ${fmt(v)}`}
            </text>
          )}
        </>
      );
      if (!clickable)
        return (
          <g key={j}>
            <title>{tip}</title>
            {dot}
          </g>
        );
      const run = () =>
        dense
          ? inspect(it.id, j)
          : it.kind === 'ghost'
            ? switchTo(it.id)
            : switchTo(index.nodes.get(it.id)!.inputs[0]);
      const pitch = it.h / Math.max(1, it.width);
      return (
        <g
          key={j}
          className="nf-hit"
          role="button"
          tabIndex={dense ? (on || (!selectedHere && j === 0) ? 0 : -1) : 0}
          data-nf-key={`${it.id}:${j}`}
          aria-label={
            dense
              ? `Inspect ${it.label} neuron ${j}, activation ${fmt(v, 4)}`
              : it.kind === 'ghost'
                ? `Show ${it.label}, value ${fmt(v, 4)}`
                : `Open the members of ${it.label}`
          }
          aria-pressed={dense ? on : undefined}
          onClick={run}
          onKeyDown={(e) => (dense ? onNeuronKey(e, it.id, j) : activate(e, run))}
        >
          <title>{tip}</title>
          <rect
            x={it.x - Math.max(10, r + 4)}
            y={y - Math.max(pitch, 2 * r) / 2}
            width={2 * Math.max(10, r + 4)}
            height={Math.max(pitch, 2 * r)}
            fill="transparent"
          />
          {dot}
        </g>
      );
    });
    return (
      <g key={it.id} className={'nf-item ' + it.kind}>
        {header}
        {neurons}
        {role}
      </g>
    );
  };

  return (
    <section className="nf" data-capture="network.flow" aria-label="Network flow overview">
      <header className="nf-head">
        <div className="nf-title">
          <span className="nf-kicker">Network flow</span>
          <span className="nf-branch" title={root}>
            {root}
          </span>
          {view.anatomy.length > 0 && (
            <span className="nf-anatomy">{view.anatomy.join(' · ')}</span>
          )}
        </div>
        <div className="nf-legend" aria-hidden="true">
          <span>
            <i className="pos" /> positive
          </span>
          <span>
            <i className="neg" /> negative
          </span>
          <span>
            <i className="line" /> edge = w·x, width ∝ |w·x| per layer
          </span>
        </div>
      </header>
      <div className="nf-scroll">
        <svg
          ref={svgRef}
          className="nf-svg"
          viewBox={`0 0 ${W} ${H}`}
          style={{ minWidth: W }}
          role="group"
          aria-label={`Layer-by-layer flow of ${root} for the current item`}
        >
          {ribbons.map((r) => (
            <path key={r.key} d={r.d} className="nf-ribbon" />
          ))}
          {weighted.map(({ edge, focus, scale }, k) => {
            const s = items.get(edge.source)!,
              t = items.get(edge.target)!,
              m = Math.abs(edge.value) / scale;
            return (
              <path
                key={k}
                d={curve(
                  s.x + half(s),
                  yOf(s, edge.sourceIndex),
                  t.x - half(t),
                  yOf(t, edge.targetIndex),
                )}
                className={'nf-edge ' + sign(edge.value) + (focus ? ' focus' : '')}
                strokeWidth={(focus ? 0.9 : 0.5) + (focus ? 3 : 2.4) * m}
                strokeOpacity={focus ? 0.35 + 0.6 * m : 0.1 + 0.55 * m}
              >
                {focus && <title>{`x[${edge.sourceIndex}]·w = ${signed(edge.value, 4)}`}</title>}
              </path>
            );
          })}
          {[...items.values()].map(renderItem)}
          {[...footers.entries()].map(([column, f]) => {
            const x = [...items.values()].find((it) => it.column === column)!.x;
            const of = [...f.of].sort((a, b) => a - b).join('/');
            return (
              <text key={column} x={x} y={H - 14} textAnchor="middle" className="nf-footer">
                {f.wide
                  ? `selected only · top ${FOCUS_TERMS}/${of}`
                  : `top ${f.shown} of ${of} w·x`}
              </text>
            );
          })}
          {view.tail.feeds.length > 0 && (
            <text x={W - 10} y={14} textAnchor="end" className="nf-footer">
              {'feeds → ' + view.tail.feeds.join(', ')}
            </text>
          )}
        </svg>
      </div>
      <p className="nf-note">
        Drawn for this item from the traced forward pass.{' '}
        {hiddenInputs
          ? `Each neuron shows its ${PER_NEURON} largest |w·x| inputs (${FOCUS_TERMS} for the selected neuron); the rest are summed below, never dropped from the arithmetic.`
          : 'All incoming terms are drawn.'}{' '}
        Grey ribbons are standardization, concatenation and elementwise maps.
      </p>
      {readout && (
        <div className="nf-readout" aria-live="polite">
          <span className="nf-readout-name">
            {view.label(selectedNodeId)}
            <sub>{readout.c}</sub>
          </span>
          <span className="nf-eq">
            <span className="nf-chip-label">top {readout.split.shown.length}</span>
            {readout.split.shown.map((t) => (
              <span
                key={t.index}
                className={'nf-term ' + sign(t.value)}
                title={`w ${fmt(t.weight, 4)} × x ${fmt(t.input, 4)}`}
              >
                x<sub>{t.index}</sub> {signed(t.value)}
              </span>
            ))}
            {readout.split.hiddenCount > 0 && (
              <span className="nf-term rest">
                + {readout.split.hiddenCount} more {signed(readout.split.hiddenSum)}
              </span>
            )}
            <span className="nf-term rest">bias {signed(readout.contribution.bias)}</span>
            <span className="nf-op">=</span>
            <b>z {fmt(readout.contribution.preactivation)}</b>
            {readout.contribution.activation !== 'linear' && (
              <>
                <span className="nf-op">→ {readout.contribution.activation}</span>
                <b>{fmt(readout.contribution.output)}</b>
              </>
            )}
            {readout.base !== undefined && Number.isFinite(readout.base) && (
              <span className="nf-term rest">baseline {fmt(readout.base)}</span>
            )}
            {readout.traced !== undefined &&
              Math.abs(readout.traced - readout.contribution.output) > 1e-9 && (
                <span className="nf-term warn">trace shows {fmt(readout.traced)}</span>
              )}
          </span>
        </div>
      )}
      {panel && <Members panel={panel} root={root} roots={roots} switchTo={switchTo} />}
    </section>
  );
}

function Members({
  panel,
  root,
  roots,
  switchTo,
}: {
  panel: EnsemblePanel;
  root: string;
  roots: string[];
  switchTo: (member: string) => void;
}) {
  const {
    ensemble,
    primary,
    summary,
    baseSummary,
    memberLabels,
    probability,
    scale,
    nested,
    threshold,
  } = panel;
  return (
    <div className="nf-members" data-capture="network.members">
      <div className="nf-members-head">
        <span className="nf-kicker">{ensemble.id}</span>
        <span className="nf-members-eq">
          mean of {summary.members.length} ={' '}
          {summary.values.length === 1
            ? `(${summary.members.map((m) => fmt(m.values[0])).join(' + ')}) / ${summary.members.length} = ${fmt(summary.values[0])}`
            : `${summary.values.length}-dimensional average · bars show vector lengths`}
        </span>
        {nested && (
          <button type="button" className="nf-up" onClick={() => switchTo(roots[0])}>
            <ArrowUpLeft size={13} /> {primary!.id}
          </button>
        )}
      </div>
      <div className="nf-member-grid">
        {summary.members.map((m, k) => {
          const v = m.values.length === 1 ? m.values[0] : Math.hypot(...m.values),
            baseValues = baseSummary?.members[k]?.values,
            b = baseValues
              ? baseValues.length === 1
                ? baseValues[0]
                : Math.hypot(...baseValues)
              : undefined;
          const active = m.id === root;
          return (
            <button
              key={m.id}
              type="button"
              className={'nf-member' + (active ? ' active' : '')}
              aria-pressed={active}
              disabled={!roots.includes(m.id)}
              onClick={() => switchTo(m.id)}
              title={m.id}
            >
              <span className="nf-member-name">{memberLabels[k]}</span>
              <Bar value={v} probability={probability} scale={scale} />
              <span className="nf-member-value">
                {m.values.length === 1 ? fmt(v) : `‖·‖ ${fmt(Math.hypot(...m.values))}`}
                {b !== undefined && Number.isFinite(b) && Math.abs(b - v) > 1e-9 && (
                  <small className={sign(v - b)}>{signed(v - b)}</small>
                )}
              </span>
            </button>
          );
        })}
        <div className="nf-member mean">
          <span className="nf-member-name">mean</span>
          <Bar
            value={summary.values.length === 1 ? summary.values[0] : Math.hypot(...summary.values)}
            probability={probability}
            scale={scale}
            threshold={threshold}
          />
          <span className="nf-member-value">
            {summary.values.length === 1
              ? fmt(summary.values[0])
              : `‖·‖ ${fmt(Math.hypot(...summary.values))}`}
          </span>
        </div>
      </div>
    </div>
  );
}

function Bar({
  value,
  probability,
  scale,
  threshold,
}: {
  value: number;
  probability: boolean;
  scale: number;
  threshold?: number;
}) {
  if (!Number.isFinite(value)) return <span className="nf-bar" />;
  if (probability)
    return (
      <span className="nf-bar">
        <i style={{ width: value * 100 + '%' }} />
        {threshold !== undefined && (
          <em style={{ left: threshold * 100 + '%' }} title={`threshold ${fmt(threshold)}`} />
        )}
      </span>
    );
  const w = (Math.abs(value) / scale) * 50;
  return (
    <span className="nf-bar centered">
      <i
        className={sign(value)}
        style={
          value >= 0 ? { left: '50%', width: w + '%' } : { left: 50 - w + '%', width: w + '%' }
        }
      />
    </span>
  );
}
