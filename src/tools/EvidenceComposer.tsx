import { primaryScore, scoreLabel, probabilityScore } from '../core/capabilities';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Minus, Layers, PackageOpen, Check, Filter } from 'lucide-react';
import { compute } from '../core/engine';
import { appUrl } from '../core/app-url';
import { useLab, useToolState } from '../core/context';
import { aggregate, poissonBinomial, mean, ranking, clamp, type Reducer } from '../core/math';
import {
  Equation,
  Label,
  Segment,
  Metric,
  Slider,
  fmt,
  count,
  InspectLink,
  Photo,
  Pill,
  Empty,
} from '../components/Shared';
import { LineChart } from '../components/Charts';

const reducers: { id: Reducer; name: string; formula: string }[] = [
  {
    id: 'topk',
    name: 'Mean of top k',
    formula: String.raw`S(C)=\frac{1}{\min(k,n)}\sum_{i=1}^{\min(k,n)}p_{(i)}`,
  },
  { id: 'max', name: 'Maximum', formula: String.raw`S(C)=\max_i p_i` },
  { id: 'mean', name: 'Mean', formula: String.raw`S(C)=\frac1n\sum_i p_i` },
  { id: 'sum', name: 'Expected count', formula: String.raw`\mathbb E[K]=\sum_i p_i` },
  {
    id: 'rate',
    name: 'Flagged fraction',
    formula: String.raw`S(C)=\frac1n\sum_i\mathbf1[p_i\ge t]`,
  },
  { id: 'supported', name: 'Supported count', formula: String.raw`k^*=\max\{k:\Pr(K\ge k)\ge c\}` },
];
export function EvidenceComposer() {
  const lab = useLab(),
    { dataset, selected, setSelected } = lab;
  const items = dataset.manifest.items;
  const [measure, setMeasure] = useToolState('compose.measure', primaryScore(dataset.manifest));
  const probabilistic = probabilityScore(dataset.manifest, measure);
  const measureKeys = [...new Set(items.flatMap((i) => Object.keys(i.scores ?? {})))];
  const values = items.map((i) => i.scores?.[measure] ?? NaN).filter(Number.isFinite);
  const lo = probabilistic ? 0 : Math.min(...values),
    hi = probabilistic ? 1 : Math.max(...values),
    span = Math.max(1e-6, hi - lo);
  const activeReducers = reducers
    .filter((r) => probabilistic || r.id !== 'supported')
    .map((r) =>
      r.id === 'sum' && !probabilistic
        ? { ...r, name: 'Sum', formula: String.raw`S(C)=\sum_i x_i` }
        : r,
    );
  const [groupBy, setGroupBy] = useToolState(
      'compose.0',
      dataset.manifest.presets?.groupBy ?? (items.some((i) => i.group) ? 'group' : 'category'),
    ),
    [method, setMethod] = useToolState<Reducer>('compose.method', 'topk'),
    [k, setK] = useToolState('compose.k', 20),
    [confidence, setConfidence] = useToolState('compose.confidence', 0.95),
    [threshold, setThreshold] = useToolState('compose.threshold', 0.5),
    [extra, setExtra] = useToolState('compose.extra', 0),
    [weak, setWeak] = useToolState('compose.weak', 0.05),
    [view, setView] = useToolState('compose.view', 'inventory'),
    [policy, setPolicy] = useToolState('compose.policy', 'strongest'),
    [previewTray, setPreviewTray] = useToolState(
      'compose.previewTray',
      items.some((i) => i.media),
    ),
    [slots, setSlots] = useToolState('compose.slots', 8);
  const groups = useMemo(() => {
    const map = new Map<string, number[]>();
    items.forEach((item, i) => {
      const key = (groupBy === 'category' ? item.category : item.group) ?? 'Ungrouped';
      if (!map.has(key)) map.set(key, []);
      if (Number.isFinite(item.scores?.[measure])) map.get(key)!.push(i);
    });
    return [...map.entries()]
      .filter(([, ids]) => ids.length > 0)
      .sort((a, b) => b[1].length - a[1].length);
  }, [items, groupBy, measure]);
  const [chosen, setChosen] = useToolState<string[]>('compose.chosen', []);
  const [groupSearch, setGroupSearch] = useToolState<string[]>('compose.groupSearch', ['', '']);
  const keys = [chosen[0] ?? groups[0]?.[0], chosen[1] ?? groups[1]?.[0] ?? groups[0]?.[0]];
  const data = useMemo(
    () =>
      keys.map((key, col) => {
        const ids = groups.find((g) => g[0] === key)?.[1] ?? [];
        const ordered = ids
          .slice()
          .sort((a, b) => (items[b].scores?.[measure] ?? 0) - (items[a].scores?.[measure] ?? 0));
        const original = ordered.map((i) => items[i].scores?.[measure] ?? 0);
        const added = col === 0 ? (Array(extra).fill(weak) as number[]) : [];
        const scores = [...original, ...added].sort((a, b) => b - a);
        const previewPool = previewTray ? ordered.filter((i) => items[i].media) : ordered;
        const center = mean(original);
        let tray = previewPool.slice(0, slots);
        if (policy === 'typical')
          tray = previewPool
            .slice()
            .sort(
              (a, b) =>
                Math.abs((items[a].scores?.[measure] ?? 0) - center) -
                Math.abs((items[b].scores?.[measure] ?? 0) - center),
            )
            .slice(0, slots);
        if (policy === 'counter') tray = previewPool.slice(-slots).reverse();
        if (policy === 'balanced')
          tray = [
            ...new Set([
              ...previewPool.slice(0, Math.ceil(slots / 2)),
              ...previewPool.slice(-Math.floor(slots / 2)).reverse(),
            ]),
          ];
        return {
          key,
          ids: ordered,
          original,
          scores,
          added,
          tray,
          baseline:
            method === 'supported' ? NaN : aggregate(original, method, k, threshold, confidence),
          value: method === 'supported' ? NaN : aggregate(scores, method, k, threshold, confidence),
        };
      }),
    [
      previewTray,
      groups,
      chosen,
      extra,
      weak,
      policy,
      slots,
      method,
      k,
      threshold,
      confidence,
      items,
      measure,
    ],
  );
  const [calculationError, setCalculationError] = useState('');
  const [supported, setSupported] = useState<{ source: typeof data; counts: number[] } | null>(
    null,
  );
  useEffect(() => {
    if (method !== 'supported') return;
    let current = true;
    setCalculationError('');
    compute('supported', {
      collections: data.flatMap((d) => [d.original, d.scores]),
      confidence,
    })
      .then((r) => {
        if (current) setSupported({ source: data, counts: r.counts });
      })
      .catch((e) => {
        if (current) setCalculationError(String(e));
      });
    return () => {
      current = false;
    };
  }, [data, confidence, method]);
  const resolved = data.map((d, i) =>
    method === 'supported'
      ? {
          ...d,
          baseline: supported?.source === data ? supported.counts[i * 2] : NaN,
          value: supported?.source === data ? supported.counts[i * 2 + 1] : NaN,
        }
      : d,
  );
  const active = selected[0];
  const record = active == null ? null : items[active];
  if (!groups.length)
    return (
      <Empty title="Add scored observations to form collections">
        Supply a scalar measurement and optional group or category for each observation. Every
        reducer operates on the loaded inventory and preserves its members.
      </Empty>
    );
  return (
    <div className="composer-layout">
      {calculationError && (
        <p role="alert" className="inline-error">
          {calculationError}
        </p>
      )}
      <aside className="experiment-controls">
        <Label>COLLECTION → EVIDENCE</Label>
        <h3>
          What supports
          <br />
          <em>the claim?</em>
        </h3>
        <label className="control-label">
          Measurement
          <select
            aria-label="Collection measurement"
            value={measure}
            onChange={(e) => {
              setMeasure(e.target.value);
              if (method === 'supported') setMethod('topk');
            }}
          >
            {measureKeys.map((key) => (
              <option key={key} value={key}>
                {scoreLabel(dataset.manifest, key)}
              </option>
            ))}
          </select>
        </label>
        <label className="control-label">
          Form collections by
          <select
            aria-label="Group observations by"
            value={groupBy}
            onChange={(e) => {
              setGroupBy(e.target.value as 'group' | 'category');
              setChosen([]);
            }}
          >
            <option value="group">Group identity</option>
            <option value="category">Annotation category</option>
          </select>
        </label>
        <label className="control-label">
          Summarize with
          <select
            aria-label="Aggregation rule"
            value={method}
            onChange={(e) => setMethod(e.target.value as Reducer)}
          >
            {activeReducers.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {method === 'topk' && (
          <Slider
            label="Top k"
            value={k}
            min={1}
            max={50}
            step={1}
            onChange={setK}
            format={String}
          />
        )}{' '}
        {method === 'rate' && (
          <Slider
            label="Score threshold"
            value={threshold}
            min={lo}
            max={hi}
            step={span / 100}
            onChange={setThreshold}
          />
        )}{' '}
        {method === 'supported' && (
          <Slider
            label="Confidence"
            value={confidence}
            min={0.5}
            max={0.99}
            step={0.01}
            onChange={setConfidence}
          />
        )}
        <div className="inspector-rule" />
        <Label>CONTROLLED INTERVENTION</Label>
        <p>Add hypothetical observations to collection A and compare the response.</p>
        <Slider
          label="Added observations"
          value={extra}
          min={0}
          max={100}
          step={5}
          onChange={setExtra}
          format={String}
        />
        <Slider
          label="Added score"
          value={weak}
          min={lo}
          max={hi}
          step={span / 100}
          onChange={setWeak}
        />
        <span className="micro-note">
          Outlined tiles are hypothetical additions. Original records stay intact.
        </span>
        <div className="inspector-bottom">
          <Label>COLLECTION SCOPE</Label>
          <p>
            {groupBy === 'category'
              ? 'Groups contain the loaded examples in each annotation category.'
              : String(
                  dataset.manifest.provenance?.groupScope ??
                    'Groups contain the observations supplied in this dataset.',
                )}
          </p>
          {dataset.manifest.presets?.relatedDataset && (
            <button
              className="text-button"
              disabled={lab.busy}
              onClick={() => lab.load(appUrl(dataset.manifest.presets!.relatedDataset!.url))}
            >
              {dataset.manifest.presets.relatedDataset.label} <ArrowRight size={14} />
            </button>
          )}
        </div>
      </aside>
      <div className="composer-main">
        <div className="composition-toolbar">
          <Segment
            value={view}
            onChange={setView}
            options={[
              { id: 'inventory', name: 'Inventory' },
              { id: 'profile', name: 'Score profiles' },
              { id: 'dossier', name: 'Evidence tray' },
            ]}
          />
          <span className="subtle">{count(groups.length)} inspectable collections</span>
        </div>
        <div data-capture="compose.equation" className="reducer-equation">
          <Equation>{activeReducers.find((r) => r.id === method)!.formula}</Equation>
          <p>
            {method === 'supported'
              ? 'Independent Bernoulli outcomes with the displayed probabilities. Exact Poisson-binomial tail; this is a probability-model experiment.'
              : method === 'topk'
                ? 'The denominator is the number actually retained. Short inventories are never padded with zero.'
                : method === 'sum'
                  ? probabilistic
                    ? 'Expected count uses linearity of expectation. It is a count, not a probability.'
                    : 'Sum preserves the units of the selected quantity.'
                  : 'The inventory stays fixed while the summary changes.'}
          </p>
        </div>
        <div data-capture="compose.collections" className="collections">
          {resolved.map((d, c) => (
            <section
              data-capture={c === 0 ? 'compose.collectionA' : 'compose.collectionB'}
              className="collection"
              key={c}
            >
              <div className="collection-top">
                <span className="collection-letter">{c === 0 ? 'A' : 'B'}</span>
                {groups.length > 120 && (
                  <input
                    className="collection-search"
                    aria-label={'Find collection ' + (c === 0 ? 'A' : 'B')}
                    placeholder="Find a collection…"
                    value={groupSearch[c]}
                    onChange={(e) => {
                      const next = groupSearch.slice();
                      next[c] = e.target.value;
                      setGroupSearch(next);
                    }}
                  />
                )}
                <select
                  aria-label={'Collection ' + (c === 0 ? 'A' : 'B')}
                  value={d.key ?? ''}
                  onChange={(e) => {
                    const next = keys.slice();
                    next[c] = e.target.value;
                    setChosen(next);
                  }}
                >
                  {groups
                    .filter(
                      ([id]) =>
                        id === d.key ||
                        id.toLowerCase().includes((groupSearch[c] ?? '').toLowerCase()),
                    )
                    .sort((a, b) => Number(b[0] === d.key) - Number(a[0] === d.key))
                    .slice(0, 120)
                    .map(([id, ids]) => (
                      <option key={id} value={id}>
                        {id.length > 30 ? id.slice(0, 18) + '…' : id} · {ids.length} records
                      </option>
                    ))}
                </select>
                <span>{count(d.ids.length)} originals</span>
              </div>
              <div className="collection-summary">
                <div>
                  <Label>{activeReducers.find((r) => r.id === method)!.name}</Label>
                  <strong>{fmt(d.value, method === 'supported' ? 0 : 3)}</strong>
                </div>
                <div className="summary-delta">
                  <span>Baseline {fmt(d.baseline)}</span>
                  <b>
                    {d.value - d.baseline >= 0 ? '+' : ''}
                    {fmt(d.value - d.baseline)}
                  </b>
                  <small>
                    {c === 0 && extra ? extra + ' added at ' + fmt(weak, 2) : 'unchanged inventory'}
                  </small>
                </div>
              </div>
              {view === 'inventory' ? (
                <div className="inventory-grid">
                  {d.ids.slice(0, 150).map((i, j) => (
                    <button
                      key={i}
                      className={
                        'evidence-tile ' +
                        (selected.includes(i) ? 'selected' : '') +
                        ' ' +
                        ((method === 'topk' && j < k) || (method === 'max' && j === 0)
                          ? 'contributes'
                          : '')
                      }
                      style={
                        {
                          '--tile-opacity':
                            0.1 + clamp(((items[i].scores?.[measure] ?? lo) - lo) / span) * 0.75,
                        } as React.CSSProperties
                      }
                      onClick={() => setSelected([i])}
                      title={
                        (items[i].name ?? items[i].id) +
                        ' · ' +
                        fmt(items[i].scores?.[measure] ?? 0)
                      }
                    >
                      <span>{fmt(items[i].scores?.[measure] ?? 0, 2)}</span>
                    </button>
                  ))}
                  {d.added.slice(0, 50).map((p, i) => (
                    <div className="evidence-tile hypothetical" key={'extra' + i}>
                      {fmt(p, 2)}
                    </div>
                  ))}
                  {d.ids.length > 150 && (
                    <div className="inventory-remainder">
                      + {count(d.ids.length - 150)} more · all included in the calculation
                    </div>
                  )}
                </div>
              ) : view === 'profile' ? (
                <LineChart
                  height={260}
                  series={[
                    { values: d.original.map((p, i) => [i + 1, p]), color: '#7b9290', dash: true },
                    {
                      values: d.scores.map((p, i) => [i + 1, p]),
                      color: c === 0 ? '#b54d36' : '#267570',
                    },
                  ]}
                  domainX={[1, Math.max(2, d.scores.length)]}
                  marker={
                    method === 'topk'
                      ? [Math.min(k, d.scores.length), d.scores[Math.min(k, d.scores.length) - 1]]
                      : undefined
                  }
                  xLabel="sorted observation"
                  domainY={[Math.min(lo, weak), Math.max(hi, weak) + 1e-9]}
                  yLabel={scoreLabel(dataset.manifest, measure)}
                />
              ) : (
                <>
                  <div className="tray-controls">
                    <select
                      aria-label={'Evidence policy ' + c}
                      value={policy}
                      onChange={(e) => setPolicy(e.target.value)}
                    >
                      <option value="strongest">Strongest evidence</option>
                      <option value="typical">Closest to the mean</option>
                      <option value="counter">Counterevidence</option>
                      <option value="balanced">Strongest + counterevidence</option>
                    </select>
                    <select
                      aria-label={'Evidence slots ' + c}
                      value={slots}
                      onChange={(e) => setSlots(+e.target.value)}
                    >
                      {[4, 8, 12].map((n) => (
                        <option key={n} value={n}>
                          {n} slots
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="preview-filter">
                    <input
                      type="checkbox"
                      checked={previewTray}
                      onChange={(e) => setPreviewTray(e.target.checked)}
                    />{' '}
                    Show supplied previews · summaries use all observations
                  </label>
                  {!d.tray.length && (
                    <p className="micro-note">
                      This collection has no supplied previews. Turn off the preview filter to
                      inspect its records.
                    </p>
                  )}
                  <div className="dossier-tray">
                    {d.tray.map((i) => (
                      <button key={i} onClick={() => setSelected([i])}>
                        <Photo item={items[i]} />
                        <span>{fmt(items[i].scores?.[measure] ?? 0)}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="collection-foot">
                <span>
                  <i className="dot positive" />
                  Higher score
                </span>
                <span>
                  {method === 'topk'
                    ? 'Outlined: retained top ' + k
                    : view === 'dossier'
                      ? 'Selected evidence preserves original identities'
                      : 'Every tile is one observation'}
                </span>
              </div>
            </section>
          ))}
        </div>
        {record && (
          <div className="selected-evidence">
            <Photo item={record} />
            <div>
              <Label>SELECTED OBSERVATION</Label>
              <strong>{record.name ?? record.id}</strong>
              <span>
                {record.id} · score {fmt(record.scores?.[measure] ?? NaN)}
              </span>
            </div>
            <InspectLink onClick={() => lab.setTool('transform')}>
              Inspect its computation
            </InspectLink>
          </div>
        )}
      </div>
    </div>
  );
}
