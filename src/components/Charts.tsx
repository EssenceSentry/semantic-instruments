import { scaleLinear, line, area, bin, extent } from 'd3';
import { fmt } from './Shared';
export function LineChart({
  series,
  xLabel = '',
  yLabel = '',
  domainX,
  domainY = [0, 1],
  marker,
  baseline,
  height = 210,
}: {
  series: { values: [number, number][]; color: string; name?: string; dash?: boolean }[];
  xLabel?: string;
  yLabel?: string;
  domainX?: [number, number];
  domainY?: [number, number];
  marker?: [number, number];
  baseline?: number;
  height?: number;
}) {
  const width = 520,
    p = { l: 43, r: 18, t: 25, b: 36 },
    dx = domainX ?? (extent(series.flatMap((s) => s.values.map((v) => v[0]))) as [number, number]);
  const x = scaleLinear()
      .domain(dx)
      .range([p.l, width - p.r]),
    y = scaleLinear()
      .domain(domainY)
      .range([height - p.b, p.t]);
  const path = line<[number, number]>()
    .x((d) => x(d[0]))
    .y((d) => y(d[1]));
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      aria-label={yLabel + ' versus ' + xLabel}
    >
      {y.ticks(4).map((v) => (
        <g key={v}>
          <line x1={p.l} x2={width - p.r} y1={y(v)} y2={y(v)} className="grid-line" />
          <text x={p.l - 9} y={y(v) + 4} textAnchor="end">
            {y.tickFormat(4)(v)}
          </text>
        </g>
      ))}
      {x.ticks(5).map((v) => (
        <text key={v} x={x(v)} y={height - 14} textAnchor="middle">
          {x.tickFormat(5)(v)}
        </text>
      ))}
      {baseline != null && (
        <line
          x1={p.l}
          x2={width - p.r}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="#999"
          strokeDasharray="4 4"
        />
      )}
      {series.map((s, i) => (
        <path
          key={i}
          d={path(s.values) ?? ''}
          fill="none"
          stroke={s.color}
          strokeWidth={2.3}
          strokeDasharray={s.dash ? '4 4' : undefined}
        />
      ))}
      {marker && (
        <>
          <line
            x1={x(marker[0])}
            x2={x(marker[0])}
            y1={p.t}
            y2={height - p.b}
            stroke="#a7812d"
            strokeDasharray="3 4"
          />
          <circle
            cx={x(marker[0])}
            cy={y(marker[1])}
            r="5"
            fill="#e4a325"
            stroke="#fff"
            strokeWidth="2"
          />
        </>
      )}
      <text x={p.l} y="13" className="axis-label">
        {yLabel}
      </text>
      <text x={width - p.r} y={height - 1} textAnchor="end" className="axis-label">
        {xLabel}
      </text>
    </svg>
  );
}
export function Histogram({
  values,
  truth,
  interval,
  range = [0, 1],
  height = 190,
  color = '#287871',
}: {
  values: number[];
  truth?: number;
  interval?: [number, number];
  range?: [number, number];
  height?: number;
  color?: string;
}) {
  const width = 520,
    p = { l: 35, r: 20, t: 22, b: 30 },
    bins = bin().domain(range).thresholds(35)(values),
    x = scaleLinear()
      .domain(range)
      .range([p.l, width - p.r]),
    y = scaleLinear()
      .domain([0, Math.max(1, ...bins.map((b) => b.length))])
      .range([height - p.b, p.t]);
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      aria-label="Distribution of repeated estimates"
    >
      {interval && interval.every(Number.isFinite) && (
        <rect
          x={x(interval[0])}
          width={Math.max(0, x(interval[1]) - x(interval[0]))}
          y={p.t}
          height={height - p.b - p.t}
          fill="#eee3c9"
        />
      )}
      {bins.map((b, i) => (
        <rect
          key={i}
          x={x(b.x0!) + 1}
          width={Math.max(0, x(b.x1!) - x(b.x0!) - 2)}
          y={y(b.length)}
          height={height - p.b - y(b.length)}
          fill={color}
          opacity=".78"
          rx="1"
        />
      ))}
      {truth != null && Number.isFinite(truth) && (
        <>
          <line
            x1={x(truth)}
            x2={x(truth)}
            y1={p.t}
            y2={height - p.b}
            stroke="#b54d36"
            strokeWidth="2"
          />
          <text
            x={x(truth) + (x(truth) > width / 2 ? -5 : 5)}
            y="13"
            textAnchor={x(truth) > width / 2 ? 'end' : 'start'}
            fill="#b54d36"
          >
            Reference {fmt(truth, 2)}
          </text>
        </>
      )}
      {x.ticks(5).map((v) => (
        <text key={v} x={x(v)} y={height - 10} textAnchor="middle">
          {x.tickFormat(5)(v)}
        </text>
      ))}
    </svg>
  );
}
export function ValueBars({
  values,
  selected,
  onSelect,
  limit = 32,
}: {
  values: number[];
  selected?: number;
  onSelect?: (i: number) => void;
  limit?: number;
}) {
  const max = Math.max(0.001, ...values.map(Math.abs));
  return (
    <div className="value-bars">
      {values.slice(0, limit).map((v, i) => (
        <button
          key={i}
          className={selected === i ? 'selected' : ''}
          title={`Coordinate ${i}: ${v.toFixed(5)}`}
          aria-label={'Coordinate ' + i}
          onClick={() => onSelect?.(i)}
        >
          <span className="value-track">
            <i
              style={{
                height: (Math.abs(v) / max) * 100 + '%',
                background: v >= 0 ? 'var(--teal)' : 'var(--rust)',
              }}
            />
          </span>
          <small>{i}</small>
        </button>
      ))}
    </div>
  );
}
