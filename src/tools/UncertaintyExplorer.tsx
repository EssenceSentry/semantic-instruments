import { compute } from '../core/engine';
import { useMemo, useState, useEffect } from 'react';
import { Eye, EyeOff, Shuffle, RotateCcw, Plus, Repeat2 } from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import { seeded, shuffle, beta, quantile, mean, ranking } from '../core/math';
import {
  Equation,
  Label,
  Segment,
  Metric,
  Slider,
  fmt,
  count,
  Pill,
  Empty,
} from '../components/Shared';
import { Histogram } from '../components/Charts';
import { MiniAudit } from '../components/MiniAudit';
import { NumericSampling } from '../components/NumericSampling';
import { primaryScore } from '../core/capabilities';
export function UncertaintyExplorer() {
  const { dataset } = useLab();
  const hasLabels = dataset.manifest.items.some((i) => i.label != null);
  const hasMedia = dataset.manifest.items.some((i) => i.media);
  const [mode, setMode] = useToolState(
    'uncertainty.mode',
    hasMedia ? 'mini' : hasLabels ? 'reference' : 'numeric',
  );
  return (
    <div className="uncertainty-workspace">
      <div className="composition-toolbar">
        <Segment
          value={mode}
          onChange={setMode}
          options={[
            ...(hasMedia ? [{ id: 'mini', name: 'Mini-audit' }] : []),
            ...(hasLabels ? [{ id: 'reference', name: 'Reference-label experiment' }] : []),
            { id: 'numeric', name: 'Sampling a quantity' },
          ]}
        />
        <span className="subtle">Observe → calculate → repeat</span>
      </div>
      <div className="uncertainty-workspace-body">
        {mode === 'mini' && hasMedia ? (
          <MiniAudit />
        ) : mode === 'reference' && hasLabels ? (
          <ReferenceAudit />
        ) : (
          <NumericSampling />
        )}
      </div>
    </div>
  );
}
function ReferenceAudit() {
  const { dataset, setSelected } = useLab(),
    items = dataset.manifest.items;
  const defaultMeasure = primaryScore(dataset.manifest);
  const hasHoldout = items.some((r) => r.split === 'holdout');
  const all = useMemo(
    () =>
      ranking(Float64Array.from(items.map((i) => i.scores?.[defaultMeasure] ?? NaN)), items).filter(
        (i) => items[i].label !== null && (!hasHoldout || items[i].split === 'holdout'),
      ),
    [items],
  );
  const [capacity, setCapacity] = useToolState('uncertainty.capacity', Math.min(600, all.length)),
    [policy, setPolicy] = useToolState('uncertainty.policy', 'stratified'),
    [prior, setPrior] = useToolState('uncertainty.prior', 'uniform'),
    [observed, setObserved] = useToolState<number[]>('uncertainty.observed', []),
    [reveal, setReveal] = useToolState('uncertainty.reveal', false),
    [round, setRound] = useToolState('uncertainty.round', 1),
    [distribution, setDistribution] = useToolState('uncertainty.distribution', 'posterior'),
    [repeats, setRepeats] = useToolState<number[]>('uncertainty.repeats', []),
    [running, setRunning] = useState(false);
  const priorA = prior === 'jeffreys' ? 0.5 : prior === 'positive' ? 4 : 1,
    priorB = prior === 'jeffreys' ? 0.5 : 1;
  const population = all.slice(0, capacity),
    known = new Set(observed),
    cells = Array.from({ length: 5 }, (_, h) =>
      population.slice(
        Math.floor((h * population.length) / 5),
        Math.floor(((h + 1) * population.length) / 5),
      ),
    );
  const truth = mean(population.map((i) => items[i].label!));
  const successes = observed.reduce((s, i) => s + items[i].label!, 0);
  const rate = observed.length ? successes / observed.length : NaN;
  const [posterior, setPosterior] = useState<number[]>([]),
    [posteriorError, setPosteriorError] = useState('');
  useEffect(() => {
    let live = true;
    setPosterior([]);
    setPosteriorError('');
    compute('reference', {
      cells,
      labels: Object.fromEntries(population.map((i) => [i, items[i].label!])),
      observed,
      priorA,
      priorB,
      round,
    })
      .then((r) => {
        if (live) setPosterior(r.values);
      })
      .catch((e) => {
        if (live) setPosteriorError(String(e));
      });
    return () => {
      live = false;
    };
  }, [capacity, observed, round, dataset, prior]);
  const interval = [quantile(posterior, 0.025), quantile(posterior, 0.975)] as [number, number],
    estimate = mean(posterior);
  const pick = (n: number, seed: number, existing: number[] = []) => {
    const random = seeded(seed),
      done = new Set(existing);
    let available = population.filter((i) => !done.has(i));
    if (policy === 'greedy') return available.slice(0, n);
    if (policy === 'uniform') return shuffle(available, random).slice(0, n);
    const bins = cells.map((c) =>
        shuffle(
          c.filter((i) => !done.has(i)),
          random,
        ),
      ),
      selected: number[] = [];
    let cursor = 0;
    while (selected.length < n && bins.some((b) => b.length)) {
      const b = bins[cursor++ % bins.length];
      if (b.length) selected.push(b.pop()!);
    }
    return selected;
  };
  const draw = (n: number) => {
    setObserved((xs) => [
      ...xs,
      ...pick(Math.min(n, population.length - xs.length), round * 187 + xs.length, xs),
    ]);
    setDistribution('posterior');
  };
  const reset = () => {
    setDistribution('posterior');
    setObserved([]);
    setRepeats([]);
    setReveal(false);
    setRound((r) => r + 1);
  };
  const repeat = () => {
    setRunning(true);
    setTimeout(() => {
      const budget = Math.min(population.length, Math.max(10, observed.length)),
        out: number[] = [];
      for (let r = 0; r < 300; r++) {
        const sample = pick(budget, round * 1919 + r * 33),
          set = new Set(sample);
        if (policy === 'stratified') {
          let estimate = 0;
          for (const c of cells) {
            const obs = c.filter((i) => set.has(i));
            estimate +=
              (c.length / population.length) *
              (obs.length ? mean(obs.map((i) => items[i].label!)) : 0.5);
          }
          out.push(estimate);
        } else out.push(mean(sample.map((i) => items[i].label!)));
      }
      setRepeats(out);
      setDistribution('repeated');
      setRunning(false);
    }, 30);
  };
  if (!population.length)
    return (
      <Empty title="Reference labels unlock sampling experiments">
        Supply binary labels and finite model scores to hide outcomes, sample observations, and
        compare uncertainty with the known answer.
      </Empty>
    );
  return (
    <div className="uncertainty-layout">
      {posteriorError && <p role="alert">{posteriorError}</p>}
      <aside className="experiment-controls">
        <Label>SAMPLE → ESTIMATE → REPEAT</Label>
        <h3>
          How much
          <br />
          <em>do we know?</em>
        </h3>
        <p>
          Reference labels exist for this population. Hide them, sample a budget, and inspect what
          the observed evidence supports.
        </p>
        <Slider
          label="Ranked population size"
          value={capacity}
          min={Math.min(50, all.length)}
          max={Math.min(2500, all.length)}
          step={10}
          onChange={(v) => {
            setCapacity(v);
            setObserved([]);
            setRepeats([]);
            setDistribution('posterior');
          }}
          format={count}
        />
        <label className="control-label">
          Sampling policy
          <select
            aria-label="Sampling policy"
            value={policy}
            onChange={(e) => {
              setPolicy(e.target.value);
              reset();
            }}
          >
            <option value="stratified">Uniform within 5 rank cells</option>
            <option value="uniform">Uniform across population</option>
            <option value="greedy">Highest-scoring first</option>
          </select>
        </label>
        <label className="control-label">
          Cell-rate prior
          <select
            aria-label="Cell-rate prior"
            value={prior}
            onChange={(e) => {
              setPrior(e.target.value);
              setDistribution('posterior');
            }}
          >
            <option value="uniform">Beta(1, 1) · uniform</option>
            <option value="jeffreys">Beta(½, ½) · Jeffreys</option>
            <option value="positive">Beta(4, 1) · positive-leaning</option>
          </select>
        </label>
        <div className="sample-actions">
          <button
            className="primary"
            onClick={() => draw(10)}
            disabled={observed.length >= population.length}
          >
            <Plus size={15} />
            Draw 10
          </button>
          <button
            className="secondary"
            onClick={() => draw(50)}
            disabled={observed.length >= population.length}
          >
            Draw 50
          </button>
        </div>
        <button
          data-tour="repeat-reference"
          className="secondary full"
          onClick={repeat}
          disabled={running}
        >
          <Repeat2 size={15} />
          {running ? 'Repeating…' : 'Repeat 300 experiments'}
        </button>
        <button className="text-button" onClick={reset}>
          <RotateCcw size={13} />
          Restart on the same population
        </button>
        <div className="inspector-rule" />
        <button
          className={'reveal-button ' + (reveal ? 'active' : '')}
          onClick={() => setReveal(!reveal)}
        >
          {reveal ? <EyeOff size={17} /> : <Eye size={17} />}{' '}
          {reveal ? 'Hide reference labels' : 'Reveal the reference answer'}
        </button>
        <div className="inspector-bottom">
          <Label>WHAT THE INTERVAL MEANS</Label>
          <p>
            Independent Beta({priorA}, {priorB}) priors for five rank-cell rates. Observed labels
            are exact; unobserved outcomes are predicted with a beta-binomial model.
          </p>
          <p className="micro-note">
            {policy === 'greedy'
              ? 'Choosing the highest scores is not uniform sampling within a cell. The rate model can be biased under this selection policy.'
              : 'Intervals depend on exchangeability within each rank cell. They are model-based, not unconditional guarantees.'}
          </p>
        </div>
      </aside>
      <div className="uncertainty-main">
        <div className="uncertainty-summary">
          <Metric
            label="Observed"
            value={count(observed.length)}
            detail={'of ' + count(population.length) + ' known-reference records'}
          />
          <Metric label="Estimated positive fraction" value={fmt(estimate * 100, 1) + '%'} />
          <Metric
            label="95% posterior interval"
            value={fmt(interval[0] * 100, 1) + '–' + fmt(interval[1] * 100, 1) + '%'}
          />
          {reveal && (
            <Metric label="Reference positive fraction" value={fmt(truth * 100, 1) + '%'} />
          )}
        </div>
        <div data-capture="simulation.population" className="population-card">
          <div className="panel-heading">
            <Label>THE RANKED POPULATION</Label>
            <span>
              {reveal ? 'All reference outcomes visible' : 'Filled marks are sampled observations'}{' '}
              · higher scores at left
            </span>
          </div>
          <div className="rank-cells">
            {cells.map((cell, h) => (
              <div className="rank-cell" key={h}>
                <div>
                  <b>{String(h + 1).padStart(2, '0')}</b>
                  <span>
                    {cell.filter((i) => known.has(i)).length} / {cell.length} observed
                  </span>
                </div>
                <div className="population-dots">
                  {cell.map((i) => (
                    <button
                      key={i}
                      className={
                        (known.has(i) ? 'observed ' : '') +
                        (known.has(i) || reveal
                          ? items[i].label === 1
                            ? 'positive'
                            : 'negative'
                          : 'hidden')
                      }
                      aria-label={
                        (known.has(i) || reveal
                          ? 'Reference label ' + items[i].label
                          : 'Hidden outcome') +
                        ' · ' +
                        items[i].id
                      }
                      title={known.has(i) || reveal ? items[i].name : 'Unobserved'}
                      onClick={() => setSelected([i])}
                    />
                  ))}
                </div>
                <div className="cell-rate">
                  <span>Beta posterior</span>
                  <b>
                    {priorA + cell.filter((i) => known.has(i) && items[i].label === 1).length},{' '}
                    {priorB + cell.filter((i) => known.has(i) && items[i].label === 0).length}
                  </b>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="uncertainty-bottom">
          <div data-capture="simulation.distribution" className="distribution-card">
            {repeats.length > 0 && (
              <Segment
                value={distribution}
                onChange={setDistribution}
                options={[
                  { id: 'posterior', name: 'Posterior outcomes' },
                  { id: 'repeated', name: 'Repeated experiments' },
                ]}
              />
            )}
            <div className="panel-heading">
              <Label>
                {distribution === 'posterior'
                  ? 'POSSIBLE POPULATION OUTCOMES'
                  : 'REPEATED SAMPLING ESTIMATES'}
              </Label>
              <span>
                {distribution === 'posterior'
                  ? '600 posterior predictive draws'
                  : '300 experiments · fixed population'}
              </span>
            </div>
            <Histogram
              values={distribution === 'posterior' ? posterior : repeats}
              truth={reveal ? truth : undefined}
              interval={distribution === 'posterior' ? interval : undefined}
              height={230}
            />
            <p>
              {distribution === 'posterior'
                ? 'Known observations remain fixed in every draw. Only the unseen portion is resampled.'
                : `Same population, same ${Math.min(population.length, Math.max(10, observed.length))}-observation budget, different random draws. ${policy === 'greedy' ? 'The deterministic selection repeats the same estimate.' : ''}`}
            </p>
          </div>
          <div className="uncertainty-math">
            <Label>OPEN THE ESTIMATOR</Label>
            <Equation>{String.raw`q_h\mid\mathcal D_h\sim\operatorname{Beta}(\alpha+s_h,\,\beta+n_h-s_h)`}</Equation>
            <Equation>{String.raw`K_h=s_h+\operatorname{Binomial}(N_h-n_h,q_h)`}</Equation>
            <Equation>{String.raw`\pi=\frac{\sum_hK_h}{\sum_hN_h}`}</Equation>
            <p>
              Each cell contributes its known positives plus a modeled number among its unobserved
              records.
            </p>
            <div className="math-key">
              <span>
                α = {priorA}, β = {priorB}
              </span>
              <span>N: population size</span>
              <span>n: sampled count</span>
              <span>s: observed positives</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
