import {
  primaryScore,
  scoreLabel,
  defaultFocusIndex,
  mostActive,
  defaultNetworkNode,
} from '../core/capabilities';
import { VectorWorkbench } from '../components/VectorWorkbench';
import { useMemo } from 'react';
import { ArrowRight, ArrowDown, Check, Minus, Plus, RotateCcw, Layers, Zap } from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import { poolFeatures, row, forwardRow, lse, mean, sigmoid } from '../core/math';
import {
  Equation,
  Label,
  Segment,
  Photo,
  Metric,
  Slider,
  InspectLink,
  fmt,
  Empty,
} from '../components/Shared';
import { FeatureAtlas } from '../components/FeatureAtlas';
import { NetworkFlow } from '../components/NetworkFlow';
import { NeuralSchematic } from '../components/NeuralSchematic';
import { LineChart, ValueBars } from '../components/Charts';
import type { Intervention, Matrix } from '../core/types';

export function TransformationWorkbench() {
  const lab = useLab(),
    { dataset, selected, setSelected, intervention, intervened } = lab;
  const m = dataset.manifest;
  const defaultMeasure = primaryScore(m);
  const index = selected[0] ?? defaultFocusIndex(m),
    item = m.items[index];
  const [tab, setTab] = useToolState(
    'transform.0',
    m.queries?.length ? 'queries' : m.model ? 'network' : 'algebra',
  );
  const [bankId, setBankId] = useToolState('transform.bankId', m.queries?.[0]?.id ?? 'image');
  const [featureBankId, setFeatureBankId] = useToolState('featureAtlas.bank', bankId);
  const bank = m.queries?.find((b) => b.id === bankId);
  const families = [...new Set(bank?.items.map((q) => q.family))];
  const [family, setFamily] = useToolState(
    'transform.2',
    m.presets?.queryFamily ?? families[0] ?? '',
  );
  const [operator, setOperator] = useToolState('transform.operator', 'boundary'),
    [disabled, setDisabled] = useToolState<string[]>('transform.disabled', intervention.disabled),
    [temperature, setTemperature] = useToolState('transform.temperature', 0.25),
    [temperatureOverride, setTemperatureOverride] = useToolState(
      'transform.temperatureOverride',
      false,
    ),
    [countNeutral, setCountNeutral] = useToolState('transform.countNeutral', true),
    [sweepScore, setSweepScore] = useToolState(
      'transform.sweepScore',
      () =>
        item.scores?.[defaultMeasure] ??
        mean(m.items.map((i) => i.scores?.[defaultMeasure] ?? NaN).filter(Number.isFinite)),
    ),
    [reference, setReference] = useToolState('transform.reference', 'all');
  const [nodeId, setNodeId] = useToolState('transform.8', defaultNetworkNode(m)),
    [inputOffset, setInputOffset] = useToolState('transform.inputOffset', 0);
  const [networkView, setNetworkView] = useToolState('network.view', 'flow');
  const sim = bank ? dataset.matrices.get(bank.similarities) : undefined;
  const defs = bank ? m.featureDefinitions?.[bank.id] : undefined;
  const input = sim ? row(sim, index) : new Float32Array();
  const familyQueries =
    bank?.items
      .map((q, i) => ({ ...q, index: i, value: input[i] }))
      .filter((q) => q.family === family)
      .sort((a, b) => b.value - a.value) ?? [];
  const positive = familyQueries
      .filter((q) => q.polarity === 'positive' && !disabled.includes(q.id))
      .map((q) => q.value),
    negative = familyQueries
      .filter((q) => q.polarity === 'negative' && !disabled.includes(q.id))
      .map((q) => q.value),
    a = positive[0] ?? 0,
    b = negative[0] ?? 0;
  const tauOverride = operator === 'lse' && temperatureOverride ? temperature : null;
  const savedTemperatures = [
    ...new Set(defs?.filter((d) => d.kind === 'lse').map((d) => d.temperature ?? 1)),
  ];
  const pooled = (values: number[], side: 'positive' | 'negative', tau: number) => {
    const total = familyQueries.filter((q) => q.polarity === side).length;
    return values.length
      ? lse(values, tau) + (countNeutral ? tau * Math.log(total / values.length) : 0)
      : 0;
  };
  const localFeatures = useMemo(
    () =>
      sim && bank && defs
        ? poolFeatures(
            { rows: 1, cols: sim.cols, data: new Float32Array(row(sim, index)) },
            bank.items,
            defs,
            disabled,
            tauOverride,
            [],
            countNeutral,
          )
        : null,
    [sim, bank, defs, index, disabled, tauOverride, countNeutral],
  );
  const trace = useMemo(() => {
    if (!m.model) return {};
    const inputs: Record<string, ArrayLike<number>> = {};
    for (const id of m.model.inputs)
      inputs[id] = row(intervened.get(id) ?? dataset.matrices.get(id)!, index);
    return forwardRow(m.model.nodes, inputs);
  }, [dataset, index, intervened]);
  const baselineTrace = useMemo(() => {
    if (!m.model) return {};
    const inputs: Record<string, ArrayLike<number>> = {};
    for (const id of m.model.inputs) inputs[id] = row(dataset.matrices.get(id)!, index);
    return forwardRow(m.model.nodes, inputs);
  }, [dataset, index]);
  const [coordinate, setCoordinate] = useToolState('transform.coordinate', () =>
    mostActive(trace[nodeId] ?? []),
  );
  const node = m.model?.nodes.find((n) => n.id === nodeId),
    denseNodes = m.model?.nodes.filter((n) => n.op === 'dense') ?? [];
  const weights = node?.weight?.[coordinate] ?? [],
    nodeInput = trace[node?.inputs[0] ?? ''] ?? [],
    nodeOutput = trace[nodeId] ?? [];
  const contributions = weights
    .map((w, i) => ({ i, w, x: nodeInput[i] ?? 0, value: w * (nodeInput[i] ?? 0) }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  const top = contributions[0];
  const preactivation =
    contributions.reduce((s, x) => s + x.value, 0) +
    (node?.bias?.[coordinate] ?? 0) +
    (top ? top.w * inputOffset : 0);
  const activation =
    node?.activation === 'relu'
      ? Math.max(0, preactivation)
      : node?.activation === 'tanh'
        ? Math.tanh(preactivation)
        : preactivation;
  const [measure, setMeasure] = useToolState('transform.measure', primaryScore(m));
  const scores = m.items
    .filter((i) => reference === 'all' || i.split === reference)
    .map((i) => i.scores?.[measure] ?? NaN)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const scoreMin = Math.min(...scores),
    scoreMax = Math.max(...scores),
    scoreSpan = Math.max(1e-8, scoreMax - scoreMin);
  const ecdf = scores.filter((s) => s <= sweepScore).length / scores.length;
  const oneRowPrediction = useMemo(() => {
    if (!localFeatures || !m.model || !bank) return null;
    const inputs: Record<string, ArrayLike<number>> = {};
    for (const id of m.model.inputs)
      inputs[id] =
        id === bank.features ? localFeatures.data : row(dataset.matrices.get(id)!, index);
    return forwardRow(m.model.nodes, inputs)[m.model.output][0];
  }, [localFeatures, m.model, bank, index, dataset]);
  const apply = () =>
    lab.applyIntervention({
      disabled,
      temperature: tauOverride,
      countNeutral,
      zeroFamilies: [],
      bankId: bank?.id,
    });
  const comparisonRows = [...new Set([index, ...selected, ...lab.pinned])].slice(0, 8).map((i) => {
    const qs =
      bank?.items
        .map((q, j) => ({ ...q, value: sim?.data[i * sim.cols + j] ?? 0 }))
        .filter((q) => q.family === family && !disabled.includes(q.id)) ?? [];
    const ps = qs.filter((q) => q.polarity === 'positive').map((q) => q.value),
      ns = qs.filter((q) => q.polarity === 'negative').map((q) => q.value);
    const a = ps.length ? Math.max(...ps) : 0,
      b = ns.length ? Math.max(...ns) : 0;
    return { i, a, b, margin: a - b, gate: a > b ? a : 0 };
  });
  const presets = m.items.map((x, i) => (x.media ? i : -1)).filter((i) => i >= 0);
  return (
    <div className="workbench">
      <div className="workbench-top">
        <Segment
          value={tab}
          onChange={setTab}
          options={[
            { id: 'algebra', name: 'Vector algebra' },
            ...(m.queries?.length ? [{ id: 'queries', name: 'Query operators' }] : []),
            ...(m.representations.some((r) => r.kind === 'features')
              ? [{ id: 'features', name: 'Feature atlas' }]
              : []),
            ...(m.model ? [{ id: 'network', name: 'Neural network' }] : []),
            ...(scores.length ? [{ id: 'calibration', name: 'Reference distributions' }] : []),
          ]}
        />
        <label className="compact-label">
          Example
          <select
            aria-label="Workbench example"
            value={index}
            onChange={(e) => setSelected([+e.target.value])}
          >
            {[...new Set([index, ...presets])].map((i) => (
              <option key={i} value={i}>
                {m.items[i].name ?? m.items[i].id}
              </option>
            ))}
          </select>
        </label>
      </div>
      {(tab === 'features' || tab === 'network') && (
        <div className="workbench-specimen" data-capture="transform.example">
          <Photo item={item} label={false} />
          <div>
            <span className="eyebrow">ONE EXAMPLE · EVERY VIEW</span>
            <strong>{item.name ?? item.id}</strong>
          </div>
          <span className="specimen-tag">{item.split ?? 'Supplied record'}</span>
          <span className="specimen-tag">
            {item.label === 1
              ? String(m.provenance?.positiveLabel ?? 'Positive')
              : item.label === 0
                ? String(m.provenance?.negativeLabel ?? 'Negative')
                : 'Unlabeled'}
          </span>
          {m.model && (
            <div className="specimen-prediction">
              <small>Graph output</small>
              <strong>{fmt(trace[m.model.output]?.[0] ?? NaN, 4)}</strong>
              {intervened.size > 0 && (
                <small>baseline {fmt(baselineTrace[m.model.output]?.[0] ?? NaN, 4)}</small>
              )}
            </div>
          )}
          {tab === 'network' && (
            <Segment
              label="Network detail"
              value={networkView}
              onChange={setNetworkView}
              options={[
                { id: 'flow', name: 'Model flow' },
                { id: 'arithmetic', name: 'Neuron arithmetic' },
              ]}
            />
          )}
        </div>
      )}
      {tab === 'features' ? (
        <FeatureAtlas
          index={index}
          bankId={featureBankId}
          onBankChange={setFeatureBankId}
          onInspectFamily={(f) => {
            setBankId(featureBankId);
            setFamily(f);
            setTab('queries');
          }}
        />
      ) : tab === 'algebra' ? (
        <VectorWorkbench />
      ) : tab === 'queries' && bank && sim && defs ? (
        <div className="workbench-grid">
          <section data-capture="queries.input" className="input-panel">
            <div className="panel-heading">
              <Label>01 / INPUTS</Label>
              <span>{bank.items.length} query similarities</span>
            </div>
            <div className="example-inline">
              <Photo item={item} />
              <div>
                <h3>{item.name ?? item.id}</h3>
                <span>
                  Reference:{' '}
                  {item.label === 1
                    ? String(m.provenance?.positiveLabel ?? 'positive')
                    : item.label === 0
                      ? String(m.provenance?.negativeLabel ?? 'negative')
                      : 'unknown'}
                </span>
              </div>
            </div>
            <div className="bank-selects">
              {m.queries!.length > 1 && (
                <select
                  aria-label="Query modality"
                  value={bankId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBankId(v);
                    setFamily(m.queries!.find((q) => q.id === v)!.items[0].family);
                    setDisabled([]);
                  }}
                >
                  {m.queries!.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.id} queries
                    </option>
                  ))}
                </select>
              )}
              <select
                aria-label="Query family"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
              >
                {families.map((f) => (
                  <option key={f} value={f}>
                    {f.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="family-actions">
              <button
                className="text-button"
                onClick={() =>
                  setDisabled((ids) => [
                    ...new Set([
                      ...ids,
                      ...familyQueries.filter((q) => q.polarity === 'negative').map((q) => q.id),
                    ]),
                  ])
                }
              >
                Remove negative family
              </button>
              <button
                className="text-button"
                onClick={() =>
                  setDisabled((ids) => ids.filter((id) => !familyQueries.some((q) => q.id === id)))
                }
              >
                Restore family
              </button>
            </div>
            <div data-capture="queries.list" className="query-list">
              {familyQueries.map((q) => (
                <button
                  className={
                    'query-entry ' + q.polarity + ' ' + (disabled.includes(q.id) ? 'muted' : '')
                  }
                  key={q.id}
                  onClick={() =>
                    setDisabled((xs) =>
                      xs.includes(q.id) ? xs.filter((x) => x !== q.id) : [...xs, q.id],
                    )
                  }
                  aria-pressed={!disabled.includes(q.id)}
                  title="Toggle this query"
                >
                  <span className="query-toggle">
                    {disabled.includes(q.id) ? <Plus size={12} /> : <Check size={12} />}
                  </span>
                  <div>
                    <span>{q.text}</span>
                    <div className="query-track">
                      <i
                        style={{
                          width:
                            Math.max(
                              0,
                              q.value / Math.max(0.0001, ...familyQueries.map((x) => x.value)),
                            ) *
                              100 +
                            '%',
                        }}
                      />
                    </div>
                  </div>
                  <b>{fmt(q.value)}</b>
                </button>
              ))}
            </div>
            <div className="micro-note">
              Click a phrase to remove it from this calculation. Model weights remain fixed.
            </div>
          </section>
          <section data-capture="queries.operation" className="operation-panel">
            <div className="panel-heading">
              <Label>02 / OPERATOR</Label>
              <span>Inspect the mechanism</span>
            </div>
            <Segment
              value={operator}
              onChange={setOperator}
              options={[
                { id: 'boundary', name: 'Competition' },
                { id: 'top2', name: 'Top two' },
                { id: 'lse', name: 'Smooth pooling' },
              ]}
            />
            {operator === 'boundary' ? (
              <>
                <div className="operator-symbol">
                  a <span>−</span> b
                </div>
                <Equation>{String.raw`a=\max_{j\in P}s_j\qquad b=\max_{j\in N}s_j`}</Equation>
                <div data-capture="queries.competition" className="competition-track">
                  <div style={{ width: (a / (a + b || 1)) * 100 + '%' }}>
                    <b>{fmt(a)}</b>
                    <small>positive</small>
                  </div>
                  <div>
                    <b>{fmt(b)}</b>
                    <small>negative</small>
                  </div>
                </div>
                <Equation>{String.raw`m=a-b\qquad g=a\,\mathbf{1}[a>b]`}</Equation>
                <div className={'gate-status ' + (a > b ? 'open' : 'closed')}>
                  <span className="gate-indicator" />
                  {a > b ? 'Positive wins · gate open' : 'Negative wins or ties · gate closed'}
                </div>
                <p>
                  The margin records the advantage. The gate keeps the positive score only when it
                  strictly wins.
                </p>
              </>
            ) : operator === 'top2' ? (
              <>
                <div className="operator-symbol">
                  s₁ <span>−</span> s₂
                </div>
                <Equation>{String.raw`\operatorname{gap}(s)=s_{(1)}-s_{(2)}`}</Equation>
                <div className="metric-row">
                  <Metric label="Strongest positive" value={fmt(a)} />
                  <Metric label="Runner-up" value={fmt(positive[1] ?? 0)} />
                </div>
                <div className="gap-ruler">
                  <i
                    style={{
                      left: (positive[1] ?? 0) * 200 + '%',
                      width: Math.max(0, a - (positive[1] ?? a)) * 200 + '%',
                    }}
                  />
                </div>
                <p>
                  A large gap means one description dominates. Two equally strong matches produce a
                  zero gap.
                </p>
              </>
            ) : (
              <>
                <div className="operator-symbol">
                  log <span>∑</span> exp
                </div>
                <Equation>{String.raw`\operatorname{LSE}_{\tau}(s)=\tau\log\sum_j e^{s_j/\tau}`}</Equation>
                <Slider
                  label="Temperature τ"
                  value={temperature}
                  min={0.01}
                  max={1}
                  step={0.01}
                  onChange={setTemperature}
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={temperatureOverride}
                    onChange={(e) => setTemperatureOverride(e.target.checked)}
                  />
                  Override all saved LSE temperatures with this τ
                </label>
                <LineChart
                  height={180}
                  series={[
                    {
                      values: Array.from({ length: 60 }, (_, i) => {
                        const t = 0.01 + (i / 59) * 0.99;
                        return [t, pooled(positive, 'positive', t)];
                      }),
                      color: '#24776e',
                    },
                  ]}
                  domainX={[0.01, 1]}
                  domainY={[0, Math.max(0.3, pooled(positive, 'positive', 1))]}
                  marker={[temperature, pooled(positive, 'positive', temperature)]}
                  xLabel="temperature"
                  yLabel="pooled value"
                />
                <p>
                  Lower temperatures approach the maximum. This curve previews one pool; the saved
                  model uses its own feature temperatures (
                  {savedTemperatures.map((t) => fmt(t, 2)).join(', ')}).
                </p>
              </>
            )}
            <div className="pooling-policy">
              <label className="control-label">
                Phrase removal
                <select
                  aria-label="Phrase removal mode"
                  value={countNeutral ? 'neutral' : 'ordinary'}
                  onChange={(e) => setCountNeutral(e.target.value === 'neutral')}
                >
                  <option value="neutral">Count-neutral LSE</option>
                  <option value="ordinary">Ordinary removal</option>
                </select>
              </label>
              {countNeutral && (
                <Equation>{String.raw`\operatorname{LSE}_{\tau}^{\mathrm{neutral}}=\operatorname{LSE}_{\tau}(s_A)+\tau\log(N/|A|)`}</Equation>
              )}
              <p className="micro-note">
                {countNeutral
                  ? 'Rescale the surviving exponential sum by N/k, keeping the original phrase-count factor. Maxima and margins still respond to removal.'
                  : 'Remove each phrase from the pool. LSE changes with both the surviving similarities and the smaller phrase count.'}{' '}
                Saved temperatures stay intact unless you explicitly override them.
              </p>
            </div>
            <div className="operation-actions">
              <button className="primary" onClick={apply} disabled={lab.busy || !defs}>
                <Zap size={15} />
                {lab.busy ? 'Recomputing…' : 'Apply across the dataset'}
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setDisabled([]);
                  setTemperature(0.25);
                  setTemperatureOverride(false);
                  lab.applyIntervention({ disabled: [], temperature: null, zeroFamilies: [] });
                }}
              >
                <RotateCcw size={13} />
                Restore baseline
              </button>
            </div>
          </section>
          <section data-capture="queries.output" className="output-panel">
            <div className="panel-heading">
              <Label>03 / OUTPUTS</Label>
              <span>For this example</span>
            </div>
            <h3>
              Evidence,
              <br />
              <em>made measurable.</em>
            </h3>
            <div className="output-number">
              <span>
                {operator === 'boundary'
                  ? 'Positive − negative'
                  : operator === 'top2'
                    ? 'Positive runner-up gap'
                    : 'Positive LSE'}
              </span>
              <strong>
                {fmt(
                  operator === 'boundary'
                    ? a - b
                    : operator === 'top2'
                      ? a - (positive[1] ?? a)
                      : pooled(positive, 'positive', temperature),
                  4,
                )}
              </strong>
            </div>
            <div data-capture="queries.features" className="output-grid">
              {(operator === 'boundary'
                ? [
                    ['Positive max', a],
                    ['Negative max', b],
                    ['Gated positive', a > b ? a : 0],
                  ]
                : operator === 'top2'
                  ? [
                      ['Second positive', positive[1] ?? 0],
                      ['Second negative', negative[1] ?? 0],
                      ['Negative gap', b - (negative[1] ?? b)],
                    ]
                  : [
                      ['Positive pool', pooled(positive, 'positive', temperature)],
                      ['Negative pool', pooled(negative, 'negative', temperature)],
                      ['Active phrases', positive.length + negative.length],
                    ]
              ).map(([k, v]) => (
                <div key={k as string}>
                  <span>{k}</span>
                  <b>{fmt(v as number)}</b>
                </div>
              ))}
            </div>
            {oneRowPrediction != null && (
              <div data-capture="queries.prediction" className="prediction-delta">
                <Label>FROZEN MODEL CONSEQUENCE</Label>
                <div>
                  <span>{fmt(m.model ? (baselineTrace[m.model.output]?.[0] ?? NaN) : NaN)}</span>
                  <ArrowRight size={20} />
                  <strong>{fmt(oneRowPrediction)}</strong>
                </div>
                <small>
                  Original → preview prediction ·{' '}
                  {tauOverride == null ? 'saved temperatures' : 'temperature override'}
                </small>
              </div>
            )}
            <InspectLink
              onClick={() => {
                apply().then(() => {
                  lab.setRepresentation(bank.features);
                  lab.setTool('space');
                });
              }}
            >
              See the geometric consequence
            </InspectLink>
            <p className="micro-note">
              Removing every query on one side uses a zero placeholder in this intervention. It is a
              sensitivity experiment, not a retrained model.
            </p>
            {comparisonRows.length > 1 && (
              <div className="cohort-calculation">
                <Label>SELECTED + PINNED EXAMPLES</Label>
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>a</th>
                      <th>b</th>
                      <th>a − b</th>
                      <th>gate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((r) => (
                      <tr key={r.i} className={r.i === index ? 'active' : ''}>
                        <td>
                          <button
                            onClick={() => setSelected([r.i, ...selected.filter((i) => i !== r.i)])}
                          >
                            {m.items[r.i].id.slice(0, 7)}
                          </button>
                        </td>
                        <td>{fmt(r.a)}</td>
                        <td>{fmt(r.b)}</td>
                        <td>{fmt(r.margin)}</td>
                        <td>{fmt(r.gate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <span className="micro-note">
                  First {comparisonRows.length} examples; same current query operation.
                </span>
              </div>
            )}
          </section>
        </div>
      ) : tab === 'network' && m.model && networkView === 'flow' ? (
        <NetworkFlow
          graph={m.model}
          trace={trace}
          baselineTrace={baselineTrace}
          selectedNodeId={nodeId}
          coordinate={coordinate}
          onInspect={(id, c) => {
            setNodeId(id);
            setCoordinate(c);
            setInputOffset(0);
          }}
        />
      ) : tab === 'network' && m.model ? (
        <div className="network-workspace">
          <aside className="network-controls">
            <Label>MODEL COMPUTATION</Label>

            <label className="control-label">
              Open a layer
              <select
                aria-label="Neural layer"
                value={nodeId}
                onChange={(e) => {
                  setNodeId(e.target.value);
                  setCoordinate(mostActive(trace[e.target.value] ?? []));
                  setInputOffset(0);
                }}
              >
                {denseNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.id} · {n.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-label">
              Output coordinate
              <select
                aria-label="Output neuron"
                value={coordinate}
                onChange={(e) => {
                  setCoordinate(+e.target.value);
                  setInputOffset(0);
                }}
              >
                {nodeOutput.map((value, i) => (
                  <option key={i} value={i}>
                    {i} · activation {fmt(value)}
                  </option>
                ))}
              </select>
            </label>
            <Equation>{String.raw`z_j=b_j+\sum_i w_{ji}x_i`}</Equation>
            <p>Choose an output coordinate to unpack every contributing term.</p>
            <div className="metric-row">
              <Metric label="Inputs" value={nodeInput.length} />
              <Metric label="Outputs" value={nodeOutput.length} />
            </div>
            <Label>
              {m.provenance?.browserProbe ? 'FITTED PROBE SCORE' : 'GRAPH OUTPUT · COORDINATE 0'}
            </Label>
            <div className="big-numeral small">{fmt(trace[m.model.output]?.[0] ?? NaN)}</div>
            <p className="micro-note">
              {m.provenance?.browserProbe
                ? 'A linear logit followed by a sigmoid. The held-out rows were excluded from fitting.'
                : (m.model.description ??
                  'Each graph operator is evaluated in its declared order, using the supplied weights.')}
            </p>
            {!!m.provenance?.browserProbe && (
              <>
                <Label>RECORDED FITTING OBJECTIVE</Label>
                <LineChart
                  height={140}
                  series={[
                    {
                      values: ((m.provenance.browserProbe as any).losses as number[]).map(
                        (v, i) => [i * 5, v],
                      ),
                      color: '#467ae0',
                    },
                  ]}
                  domainX={[0, 250]}
                  xLabel="gradient step"
                  yLabel="BCE + penalty"
                />
              </>
            )}
          </aside>
          <div data-capture="network.calculation" className="network-main">
            <div className="panel-heading">
              <Label>WEIGHTED INPUTS → PREACTIVATION → ACTIVATION</Label>
              <span>Actual exported weights</span>
            </div>
            <NeuralSchematic
              weights={node?.weight ?? []}
              inputs={nodeInput}
              outputs={nodeOutput}
              bias={node?.bias ?? []}
              selected={coordinate}
              onSelect={(i) => {
                setCoordinate(i);
                setInputOffset(0);
              }}
            />
            <div className="contribution-view">
              <div>
                <Label>COORDINATE {coordinate} / LARGEST CONTRIBUTIONS</Label>
                <div data-capture="network.contributions" className="contribution-list">
                  {contributions.slice(0, 12).map((c) => (
                    <div key={c.i}>
                      <span>
                        x<sub>{c.i}</sub>
                      </span>
                      <div className="contribution-bar">
                        <i
                          className={c.value < 0 ? 'negative' : ''}
                          style={{
                            width:
                              (Math.abs(c.value) /
                                Math.max(0.001, Math.abs(contributions[0]?.value ?? 0))) *
                                48 +
                              '%',
                          }}
                        />
                      </div>
                      <span>
                        {fmt(c.w)} × {fmt(c.x)}
                      </span>
                      <b>{fmt(c.value)}</b>
                    </div>
                  ))}
                </div>
                <p className="micro-note">
                  Signed contributions explain this preactivation. Their signs alone do not
                  determine the final model’s response.
                </p>
              </div>
              <div data-capture="network.neuron" className="neuron-result">
                <Label>OPEN NEURON</Label>
                <Equation>{String.raw`z_{${coordinate}}=${fmt(node?.bias?.[coordinate] ?? 0)}+\sum_i w_{${coordinate}i}x_i`}</Equation>
                <Metric label="Preactivation" value={fmt(preactivation, 4)} />
                <div className="activation-line">
                  <ArrowDown size={18} />
                  <span>
                    {node?.activation === 'relu'
                      ? 'ReLU: max(0, z)'
                      : (node?.activation ?? 'linear')}
                  </span>
                </div>
                <Metric label="Output activation" value={fmt(activation, 4)} />
                {top && (
                  <Slider
                    label={'Perturb input ' + top.i}
                    value={inputOffset}
                    min={-3}
                    max={3}
                    step={0.05}
                    onChange={setInputOffset}
                  />
                )}
                <span className="micro-note">
                  This slider changes this layer’s selected input only. The graph output above
                  remains the baseline.
                </span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div data-capture="reference.ecdf" className="calibration-workspace">
          <div>
            <Label>REFERENCE DISTRIBUTION</Label>
            <label className="control-label">
              Quantity
              <select
                aria-label="Reference quantity"
                value={measure}
                onChange={(e) => {
                  setMeasure(e.target.value);
                  const v = m.items
                    .map((i) => i.scores?.[e.target.value] ?? NaN)
                    .filter(Number.isFinite);
                  setSweepScore(mean(v));
                }}
              >
                {[...new Set(m.items.flatMap((i) => Object.keys(i.scores ?? {})))].map((key) => (
                  <option key={key} value={key}>
                    {scoreLabel(m, key)}
                  </option>
                ))}
              </select>
            </label>
            <label className="control-label">
              Reference population
              <select
                aria-label="Reference population"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              >
                <option value="all">All loaded records</option>
                {[...new Set(m.items.map((i) => i.split).filter(Boolean))].map((split) => (
                  <option key={split} value={split}>
                    {split}
                  </option>
                ))}
              </select>
            </label>
            <h3>
              The same score.
              <br />
              <em>A different reference.</em>
            </h3>
            <p>
              Locate a score inside the dataset’s empirical distribution. Its percentile tells us
              how unusual it is relative to these examples.
            </p>
            <Equation>{String.raw`\widehat F(s)=\frac{1}{N}\sum_{i=1}^N\mathbf1[s_i\le s]`}</Equation>
            <Slider
              label="Input score"
              value={sweepScore}
              min={scoreMin}
              max={scoreMax}
              step={scoreSpan / 200}
              onChange={setSweepScore}
            />
            <p className="micro-note">
              This is a reference percentile, not a calibrated probability of the label. No
              calibration has been fitted to the displayed holdout.
            </p>
          </div>
          <div>
            <LineChart
              height={340}
              series={[
                {
                  values: Array.from({ length: 101 }, (_, i) => [
                    scoreMin + (scoreSpan * i) / 100,
                    scores.filter((s) => s <= scoreMin + (scoreSpan * i) / 100).length /
                      scores.length,
                  ]),
                  color: '#267570',
                },
              ]}
              marker={[sweepScore, ecdf]}
              domainX={[scoreMin, scoreMax]}
              xLabel={scoreLabel(m, measure)}
              yLabel="reference percentile"
            />
            <div className="metric-row">
              <Metric label="Raw score" value={fmt(sweepScore)} />
              <Metric label="Percentile" value={fmt(ecdf * 100, 1) + '%'} />
              <Metric label="Reference examples" value={scores.length.toLocaleString()} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
