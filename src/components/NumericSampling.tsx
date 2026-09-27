import { compute } from '../core/engine';
import { useMemo, useEffect, useState } from 'react';
import { Eye, Repeat2, Shuffle } from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import { primaryScore, scoreLabel } from '../core/capabilities';
import { mean, seeded, shuffle } from '../core/math';
import { sampleMeanInterval } from '../core/audit';
import { Equation, Label, Slider, Metric, fmt, count } from './Shared';
import { Histogram } from './Charts';
export function NumericSampling() {
  const { dataset, setSelected } = useLab(),
    m = dataset.manifest;
  const [score, setScore] = useToolState('numeric.score', primaryScore(m)),
    [size, setSize] = useToolState('numeric.size', Math.min(30, m.items.length)),
    [seed, setSeed] = useToolState('numeric.seed', 1),
    [policy, setPolicy] = useToolState('numeric.policy', 'uniform'),
    [reveal, setReveal] = useToolState('numeric.reveal', false),
    [repeating, setRepeating] = useToolState('numeric.repeating', false);
  const records = useMemo(
    () =>
      m.items
        .map((item, i) => ({ i, v: item.scores?.[score] ?? NaN }))
        .filter((x) => Number.isFinite(x.v)),
    [m, score],
  );
  const n = Math.min(size, records.length),
    sample = (s: number) =>
      policy === 'uniform'
        ? shuffle(records, seeded(s)).slice(0, n)
        : records
            .slice()
            .sort((a, b) => b.v - a.v)
            .slice(0, n);
  const chosen = useMemo(() => sample(seed), [records, n, seed, policy]),
    values = records.map((r) => r.v),
    result = sampleMeanInterval(
      chosen.map((r) => r.v),
      records.length,
    ),
    truth = mean(values);
  const [repeated, setRepeated] = useState<number[]>([]),
    [calculating, setCalculating] = useState(false),
    [calculationError, setCalculationError] = useState('');
  useEffect(() => {
    let live = true;
    if (!repeating) return;
    setCalculating(true);
    setRepeated([]);
    setCalculationError('');
    compute('numeric', { values: records.map((r) => r.v), n, seed, policy })
      .then((r) => {
        if (live) setRepeated(r.values);
      })
      .catch((e) => {
        if (live) setCalculationError(String(e));
      })
      .finally(() => {
        if (live) setCalculating(false);
      });
    return () => {
      live = false;
    };
  }, [records, n, policy, seed, repeating]);
  const min = Math.min(...values),
    max = Math.max(...values),
    pad = Math.max(1e-5, (max - min) * 0.05),
    range: [number, number] = [min - pad, max + pad];
  const keys = [...new Set(m.items.flatMap((i) => Object.keys(i.scores ?? {})))];
  return (
    <div className="numeric-layout">
      {calculationError && <p role="alert">{calculationError}</p>}
      <aside className="experiment-controls">
        <Label>POPULATION → SAMPLE → ESTIMATE</Label>
        <h3>
          How much can
          <br />
          <em>a sample tell us?</em>
        </h3>
        <label className="control-label">
          Quantity
          <select
            aria-label="Sample quantity"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          >
            {keys.map((k) => (
              <option key={k} value={k}>
                {scoreLabel(m, k)}
              </option>
            ))}
          </select>
        </label>
        <Slider
          label="Sample size"
          value={n}
          min={1}
          max={records.length}
          step={1}
          onChange={setSize}
          format={count}
        />
        <label className="control-label">
          Selection policy
          <select
            value={policy}
            onChange={(e) => setPolicy(e.target.value)}
            aria-label="Numeric sampling policy"
          >
            <option value="uniform">Uniform without replacement</option>
            <option value="highest">Highest values first</option>
          </select>
        </label>
        <button
          className="primary full"
          onClick={() => {
            setSeed(seed + 1);
            setRepeating(false);
          }}
        >
          <Shuffle size={15} />
          Draw another sample
        </button>
        <button className="secondary full" onClick={() => setRepeating(!repeating)}>
          <Repeat2 size={15} />
          {repeating ? 'Show sample distribution' : 'Repeat 300 experiments'}
        </button>
        <button className="reveal-button" onClick={() => setReveal(!reveal)}>
          <Eye size={16} />
          {reveal ? 'Hide population mean' : 'Reveal population mean'}
        </button>
        <p className="micro-note">
          {policy === 'uniform'
            ? 'All records have the same inclusion probability. The interval uses a normal approximation and a finite-population correction.'
            : 'Choosing the largest values biases the sample. The displayed standard-error formula assumes uniform sampling and is not valid under this policy.'}
        </p>
      </aside>
      <div className="numeric-main">
        <div data-capture="numeric.summary" className="uncertainty-summary">
          <Metric label="Observed" value={n} detail={'of ' + count(records.length) + ' records'} />
          <Metric label="Sample mean" value={fmt(result.estimate)} />
          <Metric
            label="Approximate 95% interval"
            value={fmt(result.low) + ' – ' + fmt(result.high)}
          />
          {reveal && <Metric label="Population mean" value={fmt(truth)} />}
        </div>
        <div data-capture="numeric.distribution" className="numeric-distribution">
          <Label>{repeating ? '300 SAMPLE MEANS' : 'VALUES IN THE CURRENT SAMPLE'}</Label>
          <Histogram
            values={repeating ? repeated : chosen.map((r) => r.v)}
            range={range}
            truth={reveal ? truth : undefined}
            interval={
              !repeating && Number.isFinite(result.low) ? [result.low, result.high] : undefined
            }
            height={280}
            color="#487bde"
          />
          <p>
            {repeating
              ? 'Same population and sample size; different draws. Increase the sample size and watch the sampling distribution contract.'
              : 'The observations are actual rows. Selecting one below links it to the other instruments.'}
          </p>
        </div>
        <div className="numeric-bottom">
          <div>
            <Label>THE ESTIMATOR</Label>
            <Equation>{String.raw`\bar x=\frac1n\sum_{i\in S}x_i,\quad s^2=\frac{\sum_{i\in S}(x_i-\bar x)^2}{n-1}`}</Equation>
            <Equation>{String.raw`\mathrm{SE}(\bar x)=\sqrt{\left(1-\frac nN\right)\frac{s^2}{n}},\quad\bar x\pm1.96\,\mathrm{SE}`}</Equation>
            <p>
              The finite-population correction becomes zero when every record is observed. With one
              observation, the variance is not estimable.
            </p>
          </div>
          <div>
            <Label>SAMPLED IDENTITIES · FIRST 36</Label>
            <div className="numeric-records">
              {chosen.slice(0, 36).map((r) => (
                <button key={r.i} onClick={() => setSelected([r.i])}>
                  <span>{m.items[r.i].name ?? m.items[r.i].id}</span>
                  <b>{fmt(r.v)}</b>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
