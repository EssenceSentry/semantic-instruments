import { useMemo } from 'react';
import { useLab, useToolState } from '../core/context';
import { defaultFocusIndex, defaultComparisonIndex } from '../core/capabilities';
import { row, clamp } from '../core/math';
import { Equation, Label, Metric, Slider, Photo, fmt } from './Shared';
import { LineChart } from './Charts';

/** Algebra over arbitrary supplied vectors. No class labels or model are required. */
export function VectorWorkbench() {
  const { dataset, selected, pinned } = useLab(),
    m = dataset.manifest;
  const [representation, setRepresentation] = useToolState(
      'algebra.representation',
      m.representations[0].id,
    ),
    [other, setOther] = useToolState('algebra.other', defaultComparisonIndex(m, selected[0] ?? defaultFocusIndex(m))),
    [operation, setOperation] = useToolState('algebra.operation', 'cosine'),
    [alpha, setAlpha] = useToolState('algebra.alpha', 0.5);
  const matrix = dataset.matrices.get(representation)!,
    active = selected[0] ?? defaultFocusIndex(m),
    a = row(matrix, active),
    b = row(matrix, other);
  const calculation = useMemo(() => {
    let dot = 0,
      aa = 0,
      bb = 0,
      difference = 0;
    const terms = [];
    for (let j = 0; j < a.length; j++) {
      dot += a[j] * b[j];
      aa += a[j] ** 2;
      bb += b[j] ** 2;
      difference += (a[j] - b[j]) ** 2;
      terms.push({ j, value: a[j] * b[j] });
    }
    return {
      dot,
      na: Math.sqrt(aa),
      nb: Math.sqrt(bb),
      distance: Math.sqrt(difference),
      cosine: aa && bb ? dot / Math.sqrt(aa * bb) : NaN,
      terms: terms.sort((x, y) => Math.abs(y.value) - Math.abs(x.value)),
    };
  }, [matrix, active, other]);
  const { na, nb, cosine, dot, distance } = calculation,
    angle = Number.isFinite(cosine) ? Math.acos(clamp(cosine, -1, 1)) : 0;
  const scale = 205 / Math.max(1e-10, na, nb),
    origin = [270, 270],
    endA = [270 + na * scale, 270],
    endB = [270 + nb * Math.cos(angle) * scale, 270 - nb * Math.sin(angle) * scale],
    blend = [endA[0] * (1 - alpha) + endB[0] * alpha, endA[1] * (1 - alpha) + endB[1] * alpha];
  const result =
    operation === 'dot'
      ? dot
      : operation === 'distance'
        ? distance
        : operation === 'blend'
          ? Math.sqrt(
              (1 - alpha) ** 2 * na ** 2 + alpha ** 2 * nb ** 2 + 2 * alpha * (1 - alpha) * dot,
            )
          : cosine;
  const candidates = [
    ...new Set([
      other,
      active,
      ...pinned,
      ...m.items
        .map((x, i) => (x.media ? i : -1))
        .filter((i) => i >= 0)
        .slice(0, 60),
      ...Array.from({ length: Math.min(24, m.items.length) }, (_, i) => i),
    ]),
  ];
  const formula =
    operation === 'dot'
      ? String.raw`a^\top b=\sum_{j=1}^D a_jb_j`
      : operation === 'distance'
        ? String.raw`\|a-b\|_2=\sqrt{\sum_j(a_j-b_j)^2}`
        : operation === 'blend'
          ? String.raw`v(\alpha)=(1-\alpha)a+\alpha b`
          : String.raw`\cos\theta=\frac{a^\top b}{\|a\|\,\|b\|}`;
  return (
    <div className="algebra-workspace">
      <aside className="network-controls">
        <Label>VECTOR ALGEBRA</Label>
        <h3>
          Two records.
          <br />
          <em>One shared space.</em>
        </h3>
        <label className="control-label">
          Representation
          <select
            aria-label="Algebra representation"
            value={representation}
            onChange={(e) => setRepresentation(e.target.value)}
          >
            {m.representations.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.dimensions}D
              </option>
            ))}
          </select>
        </label>
        <div className="algebra-pair">
          <Photo item={m.items[active]} />
          <Photo item={m.items[other]} />
        </div>
        <span className="micro-note">a: {m.items[active].name ?? m.items[active].id}</span>
        <label className="control-label">
          Compare with b
          <select
            aria-label="Second vector"
            value={other}
            onChange={(e) => setOther(+e.target.value)}
          >
            {candidates.map((i) => (
              <option key={i} value={i}>
                {m.items[i].name ?? m.items[i].id}
              </option>
            ))}
          </select>
        </label>
        <label className="control-label">
          Operation
          <select
            aria-label="Vector operation"
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="cosine">Cosine similarity</option>
            <option value="dot">Dot product</option>
            <option value="distance">Euclidean distance</option>
            <option value="blend">Linear interpolation</option>
          </select>
        </label>
        <Equation>{formula}</Equation>
        {operation === 'blend' && (
          <Slider label="Interpolation α" value={alpha} onChange={setAlpha} />
        )}
        <Metric
          label={
            operation === 'blend'
              ? 'Interpolated vector norm'
              : operation === 'distance'
                ? 'Distance'
                : operation === 'dot'
                  ? 'Dot product'
                  : 'Cosine similarity'
          }
          value={fmt(result, 5)}
        />
        <p className="micro-note">
          The calculation uses all {matrix.cols} coordinates. A two-vector plane preserves their
          norms and angle exactly; it is not a fitted projection.
        </p>
      </aside>
      <div className="algebra-main">
        <div className="panel-heading">
          <Label>THE PLANE SPANNED BY a AND b</Label>
          <span>{matrix.cols} dimensions → exact pair geometry</span>
        </div>
        <svg
          data-capture="vector.geometry"
          className="vector-plane"
          viewBox="0 0 600 350"
          aria-label="Exact angle and lengths of the selected vector pair"
          role="img"
        >
          <defs>
            <marker
              id="vector-arrow-a"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10Z" fill="#4e78d4" />
            </marker>
            <marker
              id="vector-arrow-b"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto"
            >
              <path d="M0 0 L10 5 L0 10Z" fill="#319896" />
            </marker>
          </defs>
          <line x1="32" y1="270" x2="568" y2="270" stroke="#dbe4f1" />
          <line x1="270" y1="35" x2="270" y2="305" stroke="#dbe4f1" />
          {[50, 100, 150, 200].map((r) => (
            <circle key={r} cx="270" cy="270" r={r} fill="none" stroke="#eef2f7" />
          ))}
          <path
            d={`M${endA[0]},${endA[1]} L${endB[0]},${endB[1]}`}
            stroke="#b3c3dd"
            strokeDasharray="5 5"
            fill="none"
          />
          <path
            d={`M270,270 L${endA[0]},${endA[1]}`}
            stroke="#4e78d4"
            strokeWidth="3"
            markerEnd="url(#vector-arrow-a)"
          />
          <path
            d={`M270,270 L${endB[0]},${endB[1]}`}
            stroke="#319896"
            strokeWidth="3"
            markerEnd="url(#vector-arrow-b)"
          />
          <circle cx={origin[0]} cy={origin[1]} r="4" fill="#8294af" />
          <text x={endA[0] + 9} y={endA[1] + 18}>
            a
          </text>
          <text x={endB[0] - 14} y={endB[1] - 10}>
            b
          </text>
          <text x="283" y="250">
            θ = {Number.isFinite(cosine) ? fmt((angle * 180) / Math.PI, 1) + '°' : 'undefined'}
          </text>
          {operation === 'blend' && (
            <>
              <line
                x1="270"
                y1="270"
                x2={blend[0]}
                y2={blend[1]}
                stroke="#ba86c8"
                strokeWidth="2"
              />
              <circle cx={blend[0]} cy={blend[1]} r="6" fill="#ba86c8" />
              <text x={blend[0] + 9} y={blend[1] - 10}>
                v(α)
              </text>
            </>
          )}
        </svg>
        <div data-capture="vector.metrics" className="algebra-metrics">
          <Metric label="Norm of a" value={fmt(na)} />
          <Metric label="Norm of b" value={fmt(nb)} />
          <Metric label="Dot product" value={fmt(dot)} />
          <Metric label="Euclidean distance" value={fmt(distance)} />
        </div>
        <div data-capture="vector.detail" className="algebra-detail">
          <div>
            <Label>ALIGNED COORDINATES · FIRST {Math.min(64, matrix.cols)}</Label>
            <LineChart
              height={210}
              series={[
                {
                  name: 'a',
                  color: '#4e78d4',
                  values: Array.from(a)
                    .slice(0, 64)
                    .map((x, j) => [j, x]),
                },
                {
                  name: 'b',
                  color: '#319896',
                  values: Array.from(b)
                    .slice(0, 64)
                    .map((x, j) => [j, x]),
                },
              ]}
              domainX={[0, Math.max(1, Math.min(63, matrix.cols - 1))]}
              domainY={[
                Math.min(...a.slice(0, 64), ...b.slice(0, 64)) - 0.01,
                Math.max(...a.slice(0, 64), ...b.slice(0, 64)) + 0.01,
              ]}
              xLabel="coordinate"
              yLabel="value"
            />
          </div>
          <div>
            <Label>LARGEST DOT-PRODUCT TERMS</Label>
            <div className="algebra-terms">
              {calculation.terms.slice(0, 8).map((t) => (
                <div key={t.j}>
                  <span>j = {t.j}</span>
                  <span>
                    {fmt(a[t.j])} × {fmt(b[t.j])}
                  </span>
                  <b>{fmt(t.value, 4)}</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
