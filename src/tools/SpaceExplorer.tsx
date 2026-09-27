import { primaryScore, scoreLabel } from '../core/capabilities';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Columns2, Play, Pause, Pin, Focus, ChevronRight, Orbit } from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import { compute } from '../core/engine';
import { neighbors, row, metrics, mean } from '../core/math';
import type { Matrix } from '../core/types';
import { PointCloud } from '../components/PointCloud';
import {
  Equation,
  Label,
  Segment,
  Photo,
  ItemStrip,
  Metric,
  InspectLink,
  fmt,
  count,
  Pill,
} from '../components/Shared';

export function SpaceExplorer() {
  const lab = useLab(),
    {
      dataset,
      selected,
      setSelected,
      pinned,
      pin,
      representation,
      setRepresentation,
      positions,
      intervened,
    } = lab;
  const { manifest } = dataset;
  const scoreKey = primaryScore(manifest);
  const scoreValues = manifest.items
    .map((i) => i.scores?.[scoreKey] ?? NaN)
    .filter(Number.isFinite);
  const scoreRange: [number, number] = [Math.min(...scoreValues), Math.max(...scoreValues)];
  const reps = manifest.representations;
  const rep = reps.find((r) => r.id === representation) ?? reps[0];
  const [compare, setCompare] = useToolState('space.compare', false),
    [other, setOther] = useToolState('space.other', reps[Math.min(2, reps.length - 1)].id),
    [color, setColor] = useToolState(
      'space.color',
      manifest.items.some((i) => i.label != null) ? 'label' : 'score',
    ),
    [rotate, setRotate] = useToolState('space.rotate', false),
    [mode, setMode] = useToolState('space.mode', rep.overview ? 'overview' : 'pca'),
    [family, setFamily] = useToolState(
      'space.family',
      manifest.queries?.[0]?.items[0].family ?? '',
    ),
    [metric, setMetric] = useToolState<'cosine' | 'euclidean'>('space.metric', 'cosine'),
    [previewOnly, setPreviewOnly] = useToolState(
      'space.previewOnly',
      manifest.items.some((i) => !!i.media),
    );
  useEffect(() => {
    if (mode === 'overview' && !rep.overview) setMode('pca');
  }, [rep.id, mode]);
  const matrix = intervened.get(rep.id) ?? dataset.matrices.get(rep.id)!;
  const active = selected[0] ?? pinned[0] ?? -1,
    item = manifest.items[active];
  const [nearest, setNearest] = useState<{ index: number; score: number }[]>([]);
  const [finding, setFinding] = useState(false),
    [neighborError, setNeighborError] = useState('');
  useEffect(() => {
    let live = true;
    setNearest([]);
    setNeighborError('');
    if (active < 0) {
      setFinding(false);
      return;
    }
    setFinding(true);
    compute('neighbors', {
      key: rep.id,
      index: active,
      metric,
      candidates: previewOnly
        ? manifest.items.map((item, i) => (item.media ? i : -1)).filter((i) => i >= 0)
        : undefined,
    })
      .then((r) => {
        if (live) setNearest(r.neighbors);
      })
      .catch((e) => {
        if (live) setNeighborError(String(e));
      })
      .finally(() => {
        if (live) setFinding(false);
      });
    return () => {
      live = false;
    };
  }, [matrix, active, metric, previewOnly, manifest.items]);
  const candidates = useMemo(() => {
    const media = manifest.items.map((r, i) => (r.media ? i : -1)).filter((i) => i >= 0);
    return (media.length ? media : manifest.items.map((_, i) => i)).slice(0, 10);
  }, [dataset]);
  const score =
    intervened.get(manifest.model?.output ?? '') ??
    dataset.matrices.get(manifest.model?.output ?? '');
  const evaluation = useMemo(
    () =>
      score?.cols === 1
        ? metrics(
            score.data,
            manifest.items,
            manifest.model?.threshold,
            manifest.items.map((r, i) => (r.split === 'holdout' ? i : -1)).filter((i) => i >= 0),
          )
        : null,
    [score, dataset],
  );
  const showPositions = useMemo(() => {
    if (
      mode === 'boundary' &&
      manifest.queries?.length &&
      manifest.featureDefinitions?.[manifest.queries[0].id]
    ) {
      const bank = manifest.queries[0],
        defs = manifest.featureDefinitions![bank.id];
      const f = intervened.get(bank.features) ?? dataset.matrices.get(bank.features)!;
      const a = defs.findIndex(
          (d) => d.family === family && d.kind === 'max' && d.polarity === 'positive',
        ),
        b = defs.findIndex(
          (d) => d.family === family && d.kind === 'max' && d.polarity === 'negative',
        );
      if (a >= 0 && b >= 0) {
        const data = new Float32Array(manifest.items.length * 3);
        for (let i = 0; i < f.rows; i++) {
          data[i * 3] = f.data[i * f.cols + a];
          data[i * 3 + 1] = f.data[i * f.cols + b];
        }
        return { rows: f.rows, cols: 3, data };
      }
    }
    if (mode === 'overview' && rep.overview) return dataset.positions.get(rep.id + '.overview');
    if (matrix.cols === 1) {
      const data = new Float32Array(matrix.rows * 3);
      for (let i = 0; i < matrix.rows; i++) {
        data[i * 3] = matrix.data[i];
        data[i * 3 + 1] = (manifest.items[i].label ?? 0.5) + Math.sin(i * 179.21) * 0.3;
      }
      return { rows: matrix.rows, cols: 3, data };
    }
    return positions.get(rep.id) ?? dataset.positions.get(rep.id);
  }, [mode, rep, matrix, positions, dataset, family, intervened]);
  const dimensions = rep.dimensions;
  const positiveName = String(manifest.provenance?.positiveLabel ?? 'Positive'),
    negativeName = String(manifest.provenance?.negativeLabel ?? 'Negative');
  return (
    <div className="space-layout">
      <div className="space-main">
        <div className="representation-rail" aria-label="Representation">
          {reps.map((r, i) => (
            <button
              key={r.id}
              className={r.id === rep.id ? 'active' : ''}
              onClick={() => {
                setRepresentation(r.id);
                setMode(r.overview ? 'overview' : 'pca');
              }}
            >
              <span className="rep-step">{String(i + 1).padStart(2, '0')}</span>
              <span>
                {r.name}
                <small>
                  {r.dimensions} {r.dimensions === 1 ? 'dimension' : 'dimensions'}
                </small>
              </span>
              {i < reps.length - 1 && <ChevronRight size={12} />}
            </button>
          ))}
        </div>
        <div className="space-toolbar">
          <Segment
            value={mode}
            onChange={setMode}
            options={[
              ...(rep.overview ? [{ id: 'overview', name: rep.overview.method + ' map' }] : []),
              { id: 'pca', name: 'PCA view' },
              ...(manifest.queries?.length && manifest.featureDefinitions?.[manifest.queries[0].id]
                ? [{ id: 'boundary', name: 'Positive × negative' }]
                : []),
            ]}
          />
          {mode === 'boundary' && (
            <select
              aria-label="Feature family"
              value={family}
              onChange={(e) => setFamily(e.target.value)}
            >
              {[...new Set(manifest.queries?.[0].items.map((q) => q.family))].map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>
          )}
          <div className="toolbar-spacer" />
          <label className="compact-label">
            Color
            <select
              aria-label="Color points by"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            >
              <option value="label">Reference label</option>
              <option value="score">{scoreLabel(manifest, scoreKey)}</option>
              <option value="split">Holdout membership</option>
            </select>
          </label>
          <button
            className={'icon-button ' + (compare ? 'active' : '')}
            onClick={() => setCompare(!compare)}
            aria-label="Compare representations"
          >
            <Columns2 size={17} />
          </button>
          <button
            className={'icon-button ' + (rotate ? 'active' : '')}
            disabled={mode !== 'pca' || (positions.get(rep.id)?.cols ?? 0) < 3}
            onClick={() => setRotate(!rotate)}
            aria-label={rotate ? 'Pause camera rotation' : 'Rotate projection camera'}
          >
            {rotate ? <Pause size={17} /> : <Orbit size={17} />}
          </button>
        </div>
        <div
          data-capture="space.scatter"
          className={'cloud-stage ' + (compare ? 'comparison' : '')}
        >
          <div data-capture="space.primary" className="cloud-pane">
            <div className="canvas-caption">
              <Label>
                {mode === 'boundary'
                  ? 'DIRECT FEATURE AXES'
                  : rep.dimensions === 1
                    ? 'DECISION SPACE'
                    : 'REPRESENTATION GEOMETRY'}
              </Label>
              <span>{mode === 'boundary' ? family.replaceAll('_', ' ') : rep.name}</span>
            </div>
            {showPositions ? (
              <PointCloud
                positions={showPositions}
                reference={mode === 'pca' ? dataset.positions.get(rep.id) : undefined}
                items={manifest.items}
                selected={selected}
                pinned={pinned}
                onSelect={setSelected}
                colorBy={color}
                scoreKey={scoreKey}
                scoreRange={scoreRange}
                scoreName={scoreLabel(manifest, scoreKey)}
                rotate={rotate && mode === 'pca'}
                label={rep.name}
                diagonal={mode === 'boundary'}
                positiveName={positiveName}
                negativeName={negativeName}
              />
            ) : (
              <div className="computing">Computing this projection…</div>
            )}
            <div className="axis-note">
              {mode === 'boundary'
                ? 'Positive maximum →  /  Negative maximum ↑  ·  diagonal: a = b'
                : rep.dimensions === 1
                  ? 'Score →  /  reference label (or midpoint) + deterministic jitter ↑'
                  : mode === 'overview'
                    ? rep.overview?.method +
                      ' · ' +
                      (rep.overview?.parameters?.metric ?? 'supplied geometry') +
                      (rep.overview?.parameters?.neighbors
                        ? ' · ' + rep.overview.parameters.neighbors + ' neighbors'
                        : '')
                    : 'PC 1 →  /  PC 2 ↑' + (rotate ? ' · rotating the first 3 PCs' : '')}
            </div>
          </div>
          {compare && (
            <div data-capture="space.comparison" className="cloud-pane">
              <div className="canvas-caption">
                <Label>LINKED COMPARISON</Label>
                <select
                  aria-label="Comparison representation"
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                >
                  {reps
                    .filter((r) => r.dimensions > 1)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
              </div>
              {(positions.get(other) ?? dataset.positions.get(other)) && (
                <PointCloud
                  positions={(positions.get(other) ?? dataset.positions.get(other))!}
                  reference={dataset.positions.get(other)}
                  items={manifest.items}
                  selected={selected}
                  pinned={pinned}
                  onSelect={setSelected}
                  colorBy={color}
                  scoreKey={scoreKey}
                  scoreRange={scoreRange}
                  scoreName={scoreLabel(manifest, scoreKey)}
                  rotate={rotate && mode === 'pca'}
                />
              )}
              <div className="axis-note">Same items · independent PCA coordinates</div>
            </div>
          )}
          <div className="cloud-legend">
            {color === 'label' ? (
              <>
                <span>
                  <i className="dot positive" />
                  {positiveName}
                </span>
                <span>
                  <i className="dot negative" />
                  {negativeName}
                </span>
              </>
            ) : color === 'score' ? (
              <>
                <span>
                  <i className="dot negative" />
                  {fmt(scoreRange[0], 2)} · low
                </span>
                <span>
                  <i className="dot positive" />
                  {fmt(scoreRange[1], 2)} · high
                </span>
              </>
            ) : (
              <>
                <span>
                  <i className="dot positive" />
                  Holdout
                </span>
                <span>
                  <i className="dot" style={{ background: '#929591' }} />
                  Other splits
                </span>
              </>
            )}
            <span>
              <i className="dot pinned" />
              Pinned
            </span>
          </div>
          <div className="cloud-hint">
            Click to inspect · Shift-drag to select · Scroll to zoom · Double-click to reset
          </div>
        </div>
        <div data-capture="space.neighbors" className="specimen-tray">
          <div className="tray-label">
            <Label>{active >= 0 ? 'NEIGHBORHOOD' : 'PIN AN EXAMPLE'}</Label>
            <span>
              {active >= 0
                ? 'Exact ' +
                  dimensions +
                  'D ' +
                  rep.name.toLowerCase() +
                  ' distances' +
                  (previewOnly ? ' · preview subset' : '')
                : 'Follow recognizable evidence through the model'}
            </span>
            {active >= 0 && (
              <>
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={previewOnly}
                    onChange={(e) => setPreviewOnly(e.target.checked)}
                  />
                  Previews
                </label>
                <select
                  aria-label="Neighbor distance"
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as typeof metric)}
                >
                  <option value="cosine">Cosine similarity</option>
                  <option value="euclidean">Euclidean distance</option>
                </select>
              </>
            )}
          </div>
          {finding && <span className="inline-loading">Finding nearest neighbors…</span>}
          {neighborError && <span role="alert">{neighborError}</span>}
          <ItemStrip
            dataset={dataset}
            indices={active >= 0 ? [active, ...nearest.map((n) => n.index)] : candidates}
            selected={active}
            onSelect={(i) => setSelected([i])}
            pins={pinned}
            onPin={pin}
          />
        </div>
      </div>
      <aside data-capture="space.inspector" className="inspector">
        <Label>{active >= 0 ? 'SELECTED EVIDENCE' : 'THE SAME ITEMS. A NEW GEOMETRY.'}</Label>
        {active >= 0 ? (
          <>
            <div className="inspector-photo">
              <Photo item={item} />
              <button
                className={'pin large ' + (pinned.includes(active) ? 'pinned' : '')}
                onClick={() => pin(active)}
                aria-label="Pin selected example"
              >
                <Pin size={16} />
              </button>
            </div>
            <h3>{item.name ?? item.id}</h3>
            <div className="mini-id">{item.id}</div>
            <div className="metric-row">
              <Metric
                label={scoreLabel(manifest, scoreKey)}
                value={fmt(item.scores?.[scoreKey] ?? NaN)}
              />
              <Metric label="Selected" value={count(selected.length)} />
            </div>
            <InspectLink onClick={() => lab.setTool('transform')}>Open the calculation</InspectLink>
            <div className="annotation-table">
              {Object.entries(item.annotations ?? {}).map(([k, v]) => (
                <div key={k}>
                  <span>{(manifest.provenance?.annotationLabels as Record<string, string> | undefined)?.[k] ?? k.replace(/[_-]+/g, ' ')}</span>
                  <b>{v ?? '—'}</b>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <h3>
              Where does
              <br />
              <em>separation emerge?</em>
            </h3>
            <p>
              Follow each example from semantic measurements to learned codes. Every dot keeps its
              identity.
            </p>
            <div className="big-numeral">{count(manifest.items.length)}</div>
            <span className="subtle">identified examples</span>
            <div className="inspector-rule" />
            <p>
              Select an example or brush a region. Its actual neighbors appear below the canvas.
            </p>
            <Equation>{String.raw`d_{\cos}(x,y)=1-\frac{x^\top y}{\|x\|\,\|y\|}`}</Equation>
          </>
        )}
        <div className="inspector-bottom">
          <Label>READING THE GEOMETRY</Label>
          <p>
            {mode === 'boundary'
              ? 'Each axis is a real feature value. The positive gate opens where positive maximum exceeds negative maximum.'
              : 'Projection shows a view of the representation. Neighbor calculations use the full vector, independent of the camera.'}
          </p>
          {rep.projection?.explained && mode === 'pca' && (
            <div className="variance">
              <span>First 2 PCs retain</span>
              <strong>
                {fmt((rep.projection.explained[0] + rep.projection.explained[1]) * 100, 1)}%
              </strong>
            </div>
          )}
          {evaluation && evaluation.n > 0 && (
            <div className="variance">
              <span>Holdout AP · {count(evaluation.n)}</span>
              <strong>{fmt(evaluation.ap ?? NaN)}</strong>
            </div>
          )}
          <span className="micro-note">
            {manifest.provenance?.trainingSnapshots
              ? 'Training snapshots available.'
              : 'Only exported inference states are shown; no historical training animation.'}
          </span>
        </div>
      </aside>
    </div>
  );
}
