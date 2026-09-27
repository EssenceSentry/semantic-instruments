import { primaryScore, scoreLabel, distinctScoreKeys } from '../core/capabilities';
import { RankConnections } from '../components/RankConnections';
import { useMemo, useRef, useEffect } from 'react';
import { ArrowRight, ArrowUp, ArrowDown, ArrowLeftRight } from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import { ranking, metrics, clamp } from '../core/math';
import {
  Label,
  Segment,
  Metric,
  Slider,
  Equation,
  Photo,
  fmt,
  count,
  InspectLink,
  Empty,
} from '../components/Shared';
import { LineChart } from '../components/Charts';
export function RankingComparator() {
  const lanesRoot = useRef<HTMLDivElement>(null);
  const lab = useLab(),
    { dataset, selected, setSelected } = lab;
  const m = dataset.manifest,
    items = m.items;
  const defaultMeasure = primaryScore(m);
  const scoreName = (key: string) => scoreLabel(m, key);
  const scoreKeys = distinctScoreKeys(m);
  const [left, setLeft] = useToolState(
      'rank.left',
      m.presets?.ranking?.left ?? scoreKeys.find((k) => k !== defaultMeasure) ?? primaryScore(m),
    ),
    [right, setRight] = useToolState('rank.right', m.presets?.ranking?.right ?? primaryScore(m)),
    [rule, setRule] = useToolState('rank.rule', 'weighted'),
    [weight, setWeight] = useToolState('rank.weight', 0.5),
    [k, setK] = useToolState('rank.k', Math.min(100, items.length)),
    [previewRows, setPreviewRows] = useToolState(
      'rank.previewRows',
      items.some((i) => i.media),
    ),
    [view, setView] = useToolState('rank.view', 'lanes'),
    [holdout, setHoldout] = useToolState(
      'rank.6',
      items.some((i) => i.split === 'holdout'),
    );
  const eligible = useMemo(
    () =>
      items
        .map((_, i) => i)
        .filter(
          (i) =>
            (!holdout || items[i].split === 'holdout') &&
            Number.isFinite(items[i].scores?.[left]) &&
            Number.isFinite(items[i].scores?.[right]),
        ),
    [items, holdout, left, right],
  );
  const a = useMemo(
      () => Float64Array.from(items.map((i) => i.scores?.[left] ?? NaN)),
      [items, left],
    ),
    b = useMemo(
      () => Float64Array.from(items.map((i) => i.scores?.[right] ?? NaN)),
      [items, right],
    );
  const nonnegative = eligible.every((i) => a[i] >= 0 && b[i] >= 0);
  useEffect(() => {
    if (!nonnegative && rule === 'corroboration') setRule('weighted');
  }, [nonnegative, rule]);
  const eligibleSet = useMemo(() => new Set(eligible), [eligible]);
  const orderA = useMemo(
      () => ranking(a, items).filter((i) => eligibleSet.has(i)),
      [a, items, eligible],
    ),
    orderB = useMemo(
      () => ranking(b, items).filter((i) => eligibleSet.has(i)),
      [b, items, eligible],
    );
  const rankA = useMemo(() => new Map(orderA.map((i, r) => [i, r + 1])), [orderA]),
    rankB = useMemo(() => new Map(orderB.map((i, r) => [i, r + 1])), [orderB]);
  const fused = useMemo(
    () =>
      Float64Array.from(
        items.map((_, i) =>
          rule === 'max'
            ? Math.max(a[i], b[i])
            : rule === 'corroboration'
              ? Math.sqrt(Math.max(0, a[i] * b[i]))
              : rule === 'rrf'
                ? weight / (60 + (rankA.get(i) ?? items.length)) +
                  (1 - weight) / (60 + (rankB.get(i) ?? items.length))
                : weight * a[i] + (1 - weight) * b[i],
        ),
      ),
    [a, b, rule, weight, rankA, rankB],
  );
  const orderF = useMemo(
    () => ranking(fused, items).filter((i) => eligibleSet.has(i)),
    [fused, items, eligible],
  );
  const orders = [orderA, orderF, orderB],
    scores = [a, fused, b];
  const names = [scoreName(left), 'Combined rule', scoreName(right)];
  const selectedSets = orders.map((o) => new Set(o.slice(0, k))),
    common = [...selectedSets[0]].filter((i) => selectedSets[2].has(i)),
    onlyA = [...selectedSets[0]].filter((i) => !selectedSets[2].has(i)),
    onlyB = [...selectedSets[2]].filter((i) => !selectedSets[0].has(i));
  const allMetrics = scores.map((s) => metrics(s, items, 0.5, eligible));
  const selectedPrecision = orders.map((o) => {
    const list = o.slice(0, k).filter((i) => items[i].label !== null);
    return list.length ? list.reduce((s, i) => s + (items[i].label ?? 0), 0) / list.length : NaN;
  });
  const active = selected[0];
  const formula =
    rule === 'weighted'
      ? String.raw`s=\alpha a+(1-\alpha)b`
      : rule === 'max'
        ? String.raw`s=\max(a,b)`
        : rule === 'corroboration'
          ? String.raw`s=\sqrt{ab}`
          : String.raw`s=\frac{\alpha}{60+r_a}+\frac{1-\alpha}{60+r_b}`;
  const visualRows = 18;
  const lanes = orders.map((o) => {
    const top = (previewRows ? o.filter((i) => items[i].media) : o).slice(0, visualRows);
    if (active != null && !top.includes(active) && o.includes(active)) top.push(active);
    return top;
  });
  if (
    !items.some((i) => Object.values(i.scores ?? {}).some((v) => v != null && Number.isFinite(v)))
  )
    return (
      <Empty title="Supply scores to compare rankings">
        Add one or more named scores per item. The comparator will preserve identities, recompute
        orders, and use available labels for precision and recall.
      </Empty>
    );
  return (
    <div className="ranking-layout">
      <aside className="experiment-controls">
        <Label>ORDER → SELECT → COMPARE</Label>
        <h3>
          What rises.
          <br />
          <em>What gets chosen.</em>
        </h3>
        <label className="control-label">
          Left score
          <select
            aria-label="Left ranking score"
            value={left}
            onChange={(e) => setLeft(e.target.value)}
          >
            {scoreKeys.map((k) => (
              <option key={k} value={k}>
                {scoreName(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="control-label">
          Right score
          <select
            aria-label="Right ranking score"
            value={right}
            onChange={(e) => setRight(e.target.value)}
          >
            {scoreKeys.map((k) => (
              <option key={k} value={k}>
                {scoreName(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="control-label">
          Combination rule
          <select
            aria-label="Rank fusion rule"
            value={rule}
            onChange={(e) => setRule(e.target.value)}
          >
            <option value="weighted">Weighted score</option>
            <option value="max">Strongest source</option>
            <option value="corroboration" disabled={!nonnegative}>
              Geometric mean
            </option>
            <option value="rrf">Reciprocal rank fusion</option>
          </select>
        </label>
        <Equation>{formula}</Equation>
        {(rule === 'weighted' || rule === 'rrf') && (
          <Slider label="Left weight α" value={weight} onChange={setWeight} />
        )}
        <Slider
          label="Review capacity k"
          value={k}
          min={1}
          max={Math.max(1, eligible.length)}
          step={1}
          onChange={setK}
          format={count}
        />
        <label className="check-label">
          <input
            type="checkbox"
            checked={holdout}
            onChange={(e) => {
              setHoldout(e.target.checked);
              setK(
                Math.min(k, items.filter((i) => !e.target.checked || i.split === 'holdout').length),
              );
            }}
          />
          Holdout rows only
        </label>
        <p className="micro-note">
          Combinations operate on records with both scores. Weighted scores depend on source scales;
          rank fusion depends on order. Label-based metrics use labeled records only.
        </p>
        <button
          className="secondary full"
          onClick={() =>
            lab.keepScore(
              Float64Array.from(fused, (v, i) => (eligibleSet.has(i) ? v : NaN)),
              `${rule}: ${scoreName(left)} + ${scoreName(right)}; left weight ${weight}; ${eligible.length} rows with both scores${holdout ? '; holdout only' : ''}. Saved as a fixed score snapshot.`,
            )
          }
        >
          Keep score &amp; open sampling <ArrowRight size={14} />
        </button>
        {active != null && (
          <div className="rank-selection">
            <Label>SELECTED COMPARISON</Label>
            <Photo item={items[active]} />
            <strong>{items[active].name}</strong>
            <div>
              <span>#{rankA.get(active) ?? '—'}</span>
              <ArrowRight size={18} />
              <span>#{orderF.indexOf(active) + 1 || '—'}</span>
              <ArrowRight size={18} />
              <span>#{rankB.get(active) ?? '—'}</span>
            </div>
            <InspectLink onClick={() => lab.setTool('transform')}>Inspect the example</InspectLink>
          </div>
        )}
      </aside>
      <div className="ranking-main">
        <div className="composition-toolbar">
          <Segment
            value={view}
            onChange={setView}
            options={[
              { id: 'lanes', name: 'Ranking lanes' },
              { id: 'sets', name: 'Selected sets' },
              ...(items.some((i) => i.label != null)
                ? [{ id: 'curve', name: 'Precision & recall' }]
                : []),
            ]}
          />
          <label className="preview-filter">
            <input
              type="checkbox"
              checked={previewRows}
              onChange={(e) => setPreviewRows(e.target.checked)}
            />{' '}
            Browse supplied previews
          </label>
          <span className="subtle">
            {count(eligible.length)} eligible records · deterministic ID tie-break
          </span>
        </div>
        <div className="ranking-summary">
          <Metric
            label="Selected by both"
            value={count(common.length)}
            detail={'of ' + count(Math.min(k, eligible.length)) + ' per ranking'}
          />
          <Metric label={'Only ' + scoreName(left)} value={count(onlyA.length)} />
          <Metric label={'Only ' + scoreName(right)} value={count(onlyB.length)} />
          <Metric
            label="Selection overlap"
            value={fmt((common.length / Math.max(1, Math.min(k, eligible.length))) * 100, 1) + '%'}
          />
        </div>
        {view === 'lanes' ? (
          <div data-capture="rank.lanes" className="ranking-lanes" ref={lanesRoot}>
            <RankConnections
              root={lanesRoot}
              revision={[active, left, right, rule, weight, holdout, previewRows].join('|')}
            />
            {lanes.map((indices, col) => (
              <section key={col} className={'ranking-lane lane-' + col}>
                <div className="lane-heading">
                  <span>{String(col + 1).padStart(2, '0')}</span>
                  <div>
                    <h3>{names[col]}</h3>
                    <small>
                      {Number.isFinite(selectedPrecision[col])
                        ? `Labeled precision @ ${Math.min(k, eligible.length)}: ${fmt(selectedPrecision[col] * 100, 1)}%`
                        : 'Labels optional · ordering uses scores'}
                    </small>
                  </div>
                </div>
                <div className="lane-rows">
                  {indices.map((i, j) => {
                    const rank = orders[col].indexOf(i) + 1;
                    return (
                      <button
                        key={i}
                        className={
                          'rank-row ' +
                          (selected.includes(i) ? 'selected' : '') +
                          ' ' +
                          (rank <= k ? 'in-selection' : '')
                        }
                        onClick={() => setSelected([i])}
                      >
                        <span className="rank-index">{rank}</span>
                        {items[i].media && <Photo item={items[i]} label={false} />}
                        <span
                          className={
                            'rank-label ' +
                            (items[i].label === 1
                              ? 'positive'
                              : items[i].label === 0
                                ? 'negative'
                                : 'unknown')
                          }
                        />
                        <div>
                          <span>{items[i].name ?? items[i].id}</span>
                          <small>{items[i].category ?? items[i].id.slice(0, 10)}</small>
                        </div>
                        <b>{fmt(scores[col][i], rule === 'rrf' && col === 1 ? 5 : 3)}</b>
                        {rank === k && <span className="cutoff-label">cutoff</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="lane-foot">
                  {eligible.length > visualRows
                    ? `${previewRows ? 'Preview rows' : 'Top ' + visualRows} shown · all ${count(eligible.length)} ranked`
                    : ''}
                </div>
              </section>
            ))}
          </div>
        ) : view === 'sets' ? (
          <div data-capture="rank.sets" className="selection-sets">
            {[
              ['Only ' + scoreName(left), onlyA],
              ['Selected by both', common],
              ['Only ' + scoreName(right), onlyB],
            ].map(([name, ids], col) => (
              <section key={col}>
                <Label>{name as string}</Label>
                <div className="set-number">{(ids as number[]).length}</div>
                <div className="set-dots">
                  {(ids as number[]).slice(0, 420).map((i) => (
                    <button
                      key={i}
                      className={
                        items[i].label === 1
                          ? 'positive'
                          : items[i].label === 0
                            ? 'negative'
                            : 'unknown'
                      }
                      title={items[i].name}
                      onClick={() => setSelected([i])}
                    />
                  ))}
                </div>
                <span className="micro-note">
                  {(ids as number[]).length > 420 ? 'First 420 marks shown. ' : ''}Click any mark to
                  inspect its identity.
                </span>
              </section>
            ))}
          </div>
        ) : (
          <div data-capture="rank.curves" className="ranking-curves">
            <LineChart
              height={370}
              series={allMetrics.map((met, i) => ({
                values: met.pr.map((p) => [p.recall, p.precision]),
                color: ['#b54d36', '#b68d29', '#267570'][i],
                name: names[i],
              }))}
              domainX={[0, 1]}
              baseline={allMetrics[0].prevalence}
              marker={(() => {
                const ids = orderF.slice(0, k),
                  tp = ids.reduce((s, i) => s + (items[i].label ?? 0), 0);
                return [
                  tp / Math.max(1, allMetrics[1].tp + allMetrics[1].fn),
                  selectedPrecision[1],
                ];
              })()}
              xLabel="recall"
              yLabel="precision"
            />
            <div className="curve-legend">
              {names.map((name, i) => (
                <span key={i}>
                  <i style={{ background: ['#b54d36', '#b68d29', '#267570'][i] }} />
                  {name} · AP {fmt(allMetrics[i].ap ?? NaN)}
                </span>
              ))}
            </div>
            <p className="micro-note">
              Dashed line: cohort prevalence. The marker shows the combined rule’s selected
              capacity. Curves group tied scores; capacity uses a deterministic ID tie-break.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
