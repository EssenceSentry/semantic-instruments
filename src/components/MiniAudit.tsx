import { registerSceneActions, frameState } from '../core/scene-runtime';
import { useEffect, useMemo, useState } from 'react';
import {
  Maximize2,
  LoaderCircle,
  Check,
  ArrowRight,
  Undo2,
  Download,
  MousePointer2,
  Hash,
  CheckCheck,
} from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import { primaryScore, scoreLabel } from '../core/capabilities';
import { ranking } from '../core/math';
import {
  auditSessionKey,
  defaultAuditScope,
  auditPopulation,
  partitionRanks,
  summarizeAudit,
  nextAuditBatch,
  type AuditBatch,
  type AuditPosterior,
} from '../core/audit';
import { compute } from '../core/engine';
import { download } from '../core/dataset';
import { Equation, Label, Metric, Segment, Slider, fmt, count, Empty } from './Shared';
import { MediaImage } from './MediaImage';
import { Modal } from './Shared';
import { Histogram } from './Charts';

interface ClickBatch extends AuditBatch {
  selectedIds?: string[];
}
function hash(text: string) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}
export function MiniAudit() {
  const { dataset, annotateItems } = useLab(),
    m = dataset.manifest,
    items = m.items;
  const [scripted] = useToolState('audit.scripted', false);
  const [scriptedBatches, setScriptedBatches] = useToolState<ClickBatch[]>(
    'audit.scriptedBatches',
    [],
  );
  const [auditSeed] = useToolState('audit.seed', 2718);
  const [scriptedKey, setScriptedKey] = useToolState('audit.scriptedKey', '');
  const [expanded, setExpanded] = useToolState('audit.expanded', false);
  const [score, setScore] = useToolState('audit.score', primaryScore(m));
  const [scope, setScope] = useToolState<string>('audit.scope', defaultAuditScope(items));
  const [question, setQuestion] = useToolState('audit.question', () => {
    try {
      const saved = localStorage.getItem('semantic-instruments:question:' + m.id);
      if (saved) return saved;
    } catch {}
    return String(
      m.provenance?.auditQuestion ??
        'Select every image containing ' +
          (m.provenance?.positiveLabel ?? 'the concept you want to study') +
          '.',
    );
  });
  const [draftQuestion, setDraftQuestion] = useState(question);
  const [mode, setMode] = useToolState('audit.mode', 'select');
  const [band, setBand] = useToolState('audit.band', 0);
  const [target, setTarget] = useToolState('audit.target', 0.9);
  const [selected, setSelected] = useState<string[]>([]),
    [typed, setTyped] = useState('');
  const [loaded, setLoaded] = useState<Record<string, boolean>>({}),
    [failed, setFailed] = useState<Record<string, boolean>>({}),
    [retry, setRetry] = useState(0);
  const [error, setError] = useState(''),
    [result, setResult] = useState<AuditPosterior | null>(null),
    [calculating, setCalculating] = useState(false);
  const scoreKeys = [...new Set(items.flatMap((i) => Object.keys(i.scores ?? {})))];
  const ordered = useMemo(
    () =>
      auditPopulation(items, ranking(Float64Array.from(items.map((i) => i.scores?.[score] ?? NaN)), items).filter(
        (i) => items[i].media,
      ), scope),
    [items, score, scope],
  );
  const cells = useMemo(
    () =>
      partitionRanks(
        ordered.map((i) => items[i].id),
        Math.min(5, Math.max(1, Math.floor(ordered.length / 9))),
      ),
    [ordered, items],
  );
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const key = auditSessionKey(m.id, question, score, items, ordered);
  const [session, setSession] = useState<{ key: string; batches: ClickBatch[] }>({
    key: '',
    batches: [],
  });
  const batches = useMemo(
    () =>
      scripted
        ? scriptedKey === key
          ? scriptedBatches
          : []
        : session.key === key
          ? session.batches
          : [],
    [scripted, scriptedBatches, scriptedKey, session, key],
  );
  useEffect(() => {
    if (scripted) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
      summarizeAudit(cells, saved);
      setSession({ key, batches: saved });
    } catch {
      setSession({ key, batches: [] });
    }
    setBand(0);
  }, [key, scripted]);
  const bands = useMemo(() => summarizeAudit(cells, batches), [cells, batches]);
  const safeBand = Math.min(band, cells.length - 1);
  const pending = useMemo(
    () =>
      nextAuditBatch(
        cells,
        batches,
        safeBand,
        parseInt(
          hash(key + '|' + safeBand + '|' + batches.length + (scripted ? '|' + auditSeed : '')),
          36,
        ),
      ),
    [cells, batches, safeBand, key, auditSeed, scripted],
  );
  const imagesReady = pending.every((id) => loaded[id]);
  const failedImages = pending.filter((id) => failed[id]);
  const sameQuestion = !m.provenance?.labelQuestion || m.provenance.labelQuestion === question;
  useEffect(() => {
    setSelected([]);
    setTyped('');
    setError('');
  }, [pending]);
  useEffect(() => {
    let live = true;
    setCalculating(true);
    compute<AuditPosterior>('audit', {
      bands,
      target,
      draws: 2500,
      alpha: 1,
      beta: 1,
      seed: auditSeed,
    })
      .then((r) => {
        if (live) setResult(r);
      })
      .catch((e) => {
        if (live) setError(String(e));
      })
      .finally(() => {
        if (live) setCalculating(false);
      });
    return () => {
      live = false;
    };
  }, [bands, target, auditSeed]);
  function save(next: ClickBatch[]) {
    if (scripted) {
      setScriptedKey(key);
      setScriptedBatches(next);
      setError('');
      return;
    }
    setSession({ key, batches: next });
    try {
      localStorage.setItem(key, JSON.stringify(next));
      setError('');
    } catch {
      setError('Browser storage is full. Export the audit to keep it.');
    }
  }
  function submit() {
    if (!imagesReady) {
      setError('Wait for every image to load before submitting.');
      return;
    }
    const positives = mode === 'select' ? selected.length : Number(typed);
    if (
      !pending.length ||
      (mode === 'count' && typed === '') ||
      !Number.isInteger(positives) ||
      positives < 0 ||
      positives > pending.length
    ) {
      setError('Enter a whole number from 0 to ' + pending.length + '.');
      return;
    }
    const next = [
      ...batches,
      {
        band: safeBand,
        ids: pending,
        positives,
        time: new Date().toISOString(),
        ...(mode === 'select' ? { selectedIds: selected } : {}),
      },
    ];
    save(next);
    const summary = summarizeAudit(cells, next);
    const available = summary
      .map((b, h) => ({
        h,
        fraction: b.observed / Math.max(1, b.ids.length),
        remaining: b.ids.length - b.observed,
      }))
      .filter((b) => b.remaining > 0)
      .sort((a, b) => a.fraction - b.fraction || a.h - b.h);
    if (available.length) setBand(available[0].h);
  }
  useEffect(() =>
    registerSceneActions('audit', {
      state: () => ({
        scripted,
        band: safeBand,
        pendingIds: pending,
        imagesReady,
        batches,
        posterior: result
          ? {
              endpoints: result.endpoints,
              cutoffs: result.cutoffs,
              cutoffInterval: result.cutoffInterval,
              lowerBoundCutoff: result.lowerBoundCutoff,
              draws: result.draws,
            }
          : null,
      }),
      submit: (answer: { positiveIds?: string[]; positives?: number }) => {
        if (!imagesReady) throw new Error('Wait for every audit image to load.');
        if (!answer || (answer.positiveIds === undefined) === (answer.positives === undefined))
          throw new Error('Supply either positiveIds or positives.');
        if (
          answer.positiveIds &&
          (!Array.isArray(answer.positiveIds) ||
            new Set(answer.positiveIds).size !== answer.positiveIds.length ||
            answer.positiveIds.some((id) => !pending.includes(id)))
        )
          throw new Error('Positive IDs must be unique members of the pending batch.');
        const positives = answer.positiveIds?.length ?? answer.positives!;
        if (
          !pending.length ||
          !Number.isInteger(positives) ||
          positives < 0 ||
          positives > pending.length
        )
          throw new Error('Positive count lies outside the pending batch.');
        save([
          ...batches,
          {
            band: safeBand,
            ids: pending,
            positives,
            time: new Date(frameState().time * 1000).toISOString(),
            ...(answer.positiveIds ? { selectedIds: answer.positiveIds } : {}),
          },
        ]);
      },
      undo: () => save(batches.slice(0, -1)),
    }),
  );
  const observed = bands.reduce((s, b) => s + b.observed, 0),
    positives = bands.reduce((s, b) => s + b.positives, 0);
  const knownLabels = batches
    .flatMap((b) =>
      b.selectedIds ? b.ids.map((id) => ({ id, label: b.selectedIds!.includes(id) ? 1 : 0 })) : [],
    )
    .filter((x) => byId.get(x.id)?.label == null);
  const auditTask = (
    <section data-capture="audit.task" className="audit-task">
      <div className="audit-task-tools">
        <span>
          Band {safeBand + 1} / {cells.length}
        </span>
        {expanded ? (
          <select
            aria-label="Expanded audit band"
            value={safeBand}
            onChange={(e) => setBand(+e.target.value)}
          >
            {bands.map((b, i) => (
              <option key={i} value={i}>
                Band {i + 1} · {b.observed}/{b.ids.length} reviewed
              </option>
            ))}
          </select>
        ) : (
          <button className="secondary" onClick={() => setExpanded(true)}>
            <Maximize2 size={14} /> Expand audit
          </button>
        )}
      </div>
      <div className="audit-prompt">
        <Label>YOUR JUDGMENT IS THE OBSERVATION</Label>
        <h2>{question}</h2>
        <span>
          Band {safeBand + 1} ·{' '}
          {pending.length ? `${pending.length} randomly sampled images` : 'fully reviewed'}
        </span>
      </div>
      <Segment
        label="Audit input mode"
        value={mode}
        onChange={setMode}
        options={[
          { id: 'select', name: 'Select images' },
          { id: 'count', name: 'Type a count' },
        ]}
      />
      <div
        className="captcha-grid"
        role="group"
        data-capture="audit.grid"
        aria-label="Audit image grid"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      >
        {pending.map((id, j) => (
          <button
            type="button"
            key={id + ':' + retry}
            disabled={mode === 'count'}
            className={selected.includes(id) ? 'selected' : ''}
            aria-label={'Audit image ' + (j + 1)}
            aria-pressed={selected.includes(id)}
            onClick={() =>
              setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
            }
          >
            <MediaImage
              src={byId.get(id)!.media!}
              fallback={byId.get(id)!.mediaFallback}
              retry={retry}
              alt={'Audit image ' + (j + 1)}
              onLoad={() => {
                setLoaded((s) => ({ ...s, [id]: true }));
                setFailed((s) => ({ ...s, [id]: false }));
              }}
              onError={() => {
                setLoaded((s) => ({ ...s, [id]: false }));
                setFailed((s) => ({ ...s, [id]: true }));
              }}
            />
            <span className="audit-image-index">{j + 1}</span>
            <span className="audit-check">
              <Check size={21} />
            </span>
          </button>
        ))}
      </div>
      {pending.length ? (
        <form
          className="audit-submit"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {mode === 'count' ? (
            <label>
              How many match?
              <input
                aria-label="Number of positives"
                type="number"
                min="0"
                max={pending.length}
                step="1"
                placeholder={'0–' + pending.length}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </label>
          ) : (
            <div>
              <strong>{selected.length}</strong>
              <span>of {pending.length} selected</span>
            </div>
          )}
          <button className="primary" type="submit" disabled={!imagesReady}>
            {imagesReady ? 'Submit batch' : 'Loading images…'} <ArrowRight size={16} />
          </button>
        </form>
      ) : (
        <div className="audit-complete">
          <CheckCheck size={28} />
          <h3>This band is complete.</h3>
          <p>Choose another band to continue.</p>
        </div>
      )}
      {!!failedImages.length && (
        <button
          className="secondary full"
          onClick={() => {
            setRetry((r) => r + 1);
            setError('');
            setLoaded({});
            setFailed({});
          }}
        >
          Retry {failedImages.length} missing images
        </button>
      )}
      <p className="micro-note">
        {mode === 'select'
          ? 'Selected images become positives; unselected images become negatives when you submit. Space toggles a tile; Enter submits the grid.'
          : 'Enter submits the count. No individual labels are inferred from a batch count.'}{' '}
        Each image appears at most once in the audit.
      </p>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <details className="audit-question">
        <summary>Change the question</summary>
        <textarea
          aria-label="Audit question"
          value={draftQuestion}
          onChange={(e) => setDraftQuestion(e.target.value)}
        />
        <button
          className="secondary"
          onClick={() => {
            if (draftQuestion.trim()) {
              setQuestion(draftQuestion.trim());
              try {
                localStorage.setItem('semantic-instruments:question:' + m.id, draftQuestion.trim());
              } catch {}
            }
          }}
        >
          Use this question
        </button>
        <p className="micro-note">Each question has a separate saved audit.</p>
      </details>
      {!!knownLabels.length && (
        <button
          className="secondary full"
          disabled={!sameQuestion}
          onClick={() => annotateItems(knownLabels, question)}
        >
          <CheckCheck size={15} />
          Use {knownLabels.length} individual labels for a toy model
        </button>
      )}
      {!!knownLabels.length && !sameQuestion && (
        <p className="micro-note">
          Existing labels use a different question. Export this audit or load fresh images to train
          another concept.
        </p>
      )}
    </section>
  );
  if (!ordered.length)
    return (
      <Empty title="Bring images to run a mini-audit">
        Load images with the dataset menu. This audit samples previews from a ranked list, collects
        your judgments, and calculates uncertainty in the browser.
      </Empty>
    );
  return (
    <div className="mini-audit-layout">
      <aside className="experiment-controls audit-controls">
        <Label>RANK → SAMPLE → COUNT</Label>
        <h3>
          A few images.
          <br />
          <em>A live estimate.</em>
        </h3>
        <label className="control-label">
          Rank by
          <select
            aria-label="Audit ranking score"
            value={score}
            onChange={(e) => setScore(e.target.value)}
          >
            {scoreKeys.map((k) => (
              <option key={k} value={k}>
                {scoreLabel(m, k)}
              </option>
            ))}
          </select>
        </label>
        <label className="control-label">Audit population
          <select aria-label="Audit population" value={scope} onChange={e => setScope(e.target.value)}>
            {items.some(i => i.media && i.split === 'holdout') && <option value="holdout">Held-out previews</option>}
            <option value="all">All ranked previews</option>
          </select>
        </label>
        <p className="micro-note">{scope === 'holdout' ? 'Fit rows are excluded from this audit.' : items.some(i => i.split === 'fit') ? 'Includes fit rows. This is not an independent assessment of generalization.' : 'All available ranked previews form the population.'}</p>
        <Label>CHOOSE A RANK BAND</Label>
        <div className="audit-bands">
          {bands.map((b, h) => {
            const start = cells.slice(0, h).reduce((s, c) => s + c.length, 0);
            return (
              <button
                key={h}
                className={h === safeBand ? 'active' : ''}
                onClick={() => setBand(h)}
                aria-label={'Audit band ' + (h + 1)}
              >
                <b>0{h + 1}</b>
                <span>
                  Ranks {start + 1}–{start + b.ids.length}
                  <small>
                    {b.observed} / {b.ids.length} reviewed
                  </small>
                  <i>
                    <em style={{ width: (100 * b.observed) / Math.max(1, b.ids.length) + '%' }} />
                  </i>
                </span>
                {b.observed === b.ids.length && <Check size={14} />}
              </button>
            );
          })}
        </div>
        <Slider
          label="Precision target"
          value={target}
          min={0.5}
          max={1}
          step={0.01}
          onChange={setTarget}
          format={(x) => fmt(100 * x, 0) + '%'}
        />
        <p className="micro-note">
          {ordered.length === items.length
            ? 'Every loaded record has a preview. The loaded dataset is the audit population.'
            : `${count(ordered.length)} preview records form this audit population. Results describe this preview set, not the full ${count(items.length)}-record dataset.`}
        </p>
        <button
          className="text-button"
          disabled={!batches.length}
          onClick={() => save(batches.slice(0, -1))}
        >
          <Undo2 size={14} />
          Undo last batch
        </button>
        <button
          data-tour="audit-export"
          className="secondary full"
          onClick={() =>
            download(
              m.id + '-mini-audit.json',
              JSON.stringify(
                {
                  schemaVersion: 1,
                  dataset: m.id,
                  question,
                  score,
                  population: cells.flat(),
                  bands: cells,
                  prior: { alpha: 1, beta: 1 },
                  target,
                  batches,
                  posterior: result,
                },
                null,
                2,
              ),
              'application/json',
            )
          }
        >
          <Download size={14} />
          Export audit
        </button>
      </aside>
      {expanded ? (
        <>
          <div className="audit-popup-placeholder">
            <Maximize2 size={25} />
            <h3>Audit is expanded</h3>
            <button className="secondary" onClick={() => setExpanded(false)}>
              Return to workspace
            </button>
          </div>
          <Modal title="Mini-audit" className="audit-modal" wide onClose={() => setExpanded(false)}>
            {auditTask}
          </Modal>
        </>
      ) : (
        auditTask
      )}
      <section className="audit-inference">
        <div className="panel-heading">
          <Label>UNCERTAINTY UPDATES WITH EVERY BATCH</Label>
          <span>
            {calculating && <LoaderCircle className="spin" size={13} />}{' '}
            {calculating ? 'Calculating…' : '2,500 Monte Carlo draws'}
          </span>
        </div>
        <div className="metric-row">
          <Metric
            label="Reviewed"
            value={observed}
            detail={positives + ' positives in ' + batches.length + ' batches'}
          />
          <Metric label="Population" value={ordered.length} detail="preview records" />
        </div>
        {result && !calculating && (
          <>
            <AuditCurve points={result.endpoints} target={target} />
            <div className="audit-legend">
              <span>
                <i />
                Posterior mean
              </span>
              <span>
                <i />
                95% pointwise interval
              </span>
            </div>
            <div className="audit-cutoff">
              <Metric
                label="Largest cutoff meeting target"
                value={result.lowerBoundCutoff || 'None yet'}
                detail="using the pointwise 95% lower bound"
              />
              <p>
                The threshold moves only at band boundaries. Rank {result.lowerBoundCutoff || '0'}{' '}
                means keeping that many top-ranked previews.
              </p>
            </div>
            <Histogram
              values={result.cutoffs}
              range={[0, ordered.length]}
              interval={result.cutoffInterval}
              height={155}
              color="#4779df"
            />
            <p className="micro-note">
              Possible largest qualifying cutoffs: 95% of draws fall in {result.cutoffInterval[0]}–
              {result.cutoffInterval[1]}. Zero means no boundary meets the target.
            </p>
          </>
        )}
        <details data-capture="audit.math" className="audit-math" open>
          <summary>Open the calculation</summary>
          <div className="audit-current-band">
            <b>Band {safeBand + 1}</b>
            <span>
              N = {bands[safeBand].ids.length} · n = {bands[safeBand].observed} · s ={' '}
              {bands[safeBand].positives}
            </span>
            <strong>
              Beta({1 + bands[safeBand].positives},{' '}
              {1 + bands[safeBand].observed - bands[safeBand].positives})
            </strong>
          </div>
          <Equation>{String.raw`q_h\mid\mathcal D\sim\mathrm{Beta}(1+s_h,1+n_h-s_h)`}</Equation>
          <Equation>{String.raw`K_h=s_h+\mathrm{Binomial}(N_h-n_h,q_h)`}</Equation>
          <Equation>{String.raw`\mathrm{Precision}@r_j=\frac{\sum_{h\le j}K_h}{\sum_{h\le j}N_h}`}</Equation>
          <p>
            Known counts stay fixed. Each draw fills only the unseen portion. Bands have independent
            Beta(1,1) priors; images within a band are modeled as exchangeable. The ribbon is
            pointwise, not a simultaneous guarantee for choosing a cutoff.
          </p>
        </details>
      </section>
    </div>
  );
}
function AuditCurve({ points, target }: { points: AuditPosterior['endpoints']; target: number }) {
  const w = 520,
    h = 260,
    l = 45,
    r = 18,
    t = 20,
    b = 38,
    n = points.at(-1)?.rank ?? 1;
  const x = (v: number) => l + (v / n) * (w - l - r),
    y = (v: number) => h - b - v * (h - t - b);
  const line = (key: 'mean' | 'low' | 'high') =>
    points.map((p, i) => (i ? 'L' : 'M') + x(p.rank) + ',' + y(p[key])).join(' ');
  const ribbon =
    line('high') +
    ' ' +
    points
      .slice()
      .reverse()
      .map((p) => 'L' + x(p.rank) + ',' + y(p.low))
      .join(' ') +
    ' Z';
  return (
    <svg
      data-capture="audit.curve"
      className="chart audit-curve"
      viewBox={`0 0 ${w} ${h}`}
      aria-label="Precision and uncertainty at rank band boundaries"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((v) => (
        <g key={v}>
          <line x1={l} x2={w - r} y1={y(v)} y2={y(v)} className="grid-line" />
          <text x={l - 8} y={y(v) + 4} textAnchor="end">
            {Math.round(v * 100)}%
          </text>
        </g>
      ))}
      <path d={ribbon} fill="#e0eafd" />
      <path d={line('mean')} stroke="#3268d3" strokeWidth="2.5" fill="none" />
      <line
        x1={l}
        x2={w - r}
        y1={y(target)}
        y2={y(target)}
        stroke="#db8b31"
        strokeDasharray="4 4"
      />
      {points.map((p) => (
        <g key={p.rank}>
          <circle cx={x(p.rank)} cy={y(p.mean)} r="4" fill="#3268d3" />
          <text x={x(p.rank)} y={h - 19} textAnchor="middle">
            {p.rank}
          </text>
        </g>
      ))}
      <text x={l} y="11">
        cumulative precision
      </text>
      <text x={w - r} y={h - 2} textAnchor="end">
        rank boundary
      </text>
    </svg>
  );
}
