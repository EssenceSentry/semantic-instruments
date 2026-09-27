import { useMemo } from 'react';
import { fmt } from './Shared';
export function NeuralSchematic({
  weights,
  inputs,
  outputs,
  selected,
  onSelect,
  bias,
}: {
  weights: number[][];
  inputs: number[];
  outputs: number[];
  selected: number;
  onSelect: (i: number) => void;
  bias: number[];
}) {
  const ranked = useMemo(
    () =>
      inputs
        .map((x, i) => ({ i, x, v: (weights[selected]?.[i] ?? 0) * x }))
        .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)),
    [weights, inputs, selected],
  );
  const shown = ranked.slice(0, 12),
    others = ranked.slice(12).reduce((s, x) => s + x.v, 0),
    height = 310,
    width = 760;
  const visibleOutputs = [...new Set([...Array.from({length: Math.min(16, outputs.length)}, (_, i) => i), selected])].filter(i => i < outputs.length);
  const ix = 146,
    ox = 572,
    iy = (i: number) => 42 + i * 19,
    oy = (i: number) => 44 + visibleOutputs.indexOf(i) * (230 / Math.max(1, visibleOutputs.length - 1)),
    maximum = Math.max(0.0001, ...ranked.map((x) => Math.abs(x.v)));
  const active = Math.min(selected, outputs.length - 1);
  return (
    <svg
      data-capture="network.diagram"
      className="neural-schematic"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Actual weighted connections into the selected neuron"
    >
      <text x="25" y="18" className="schematic-label">
        LARGEST INPUT CONTRIBUTIONS
      </text>
      <text x="530" y="18" className="schematic-label">
        OUTPUT ACTIVATIONS {visibleOutputs.length < outputs.length ? `(${visibleOutputs.length}/${outputs.length})` : ''}
      </text>
      {shown.map((c, i) => (
        <path
          key={'line' + c.i}
          d={`M${ix} ${iy(i)} C300 ${iy(i)} 415 ${oy(active)} ${ox} ${oy(active)}`}
          fill="none"
          stroke={c.v < 0 ? '#d29178' : '#4d9cac'}
          opacity={0.2 + (0.65 * Math.abs(c.v)) / maximum}
          strokeWidth={0.6 + (4 * Math.abs(c.v)) / maximum}
        />
      ))}
      {shown.map((c, i) => (
        <g key={c.i}>
          <text x="25" y={iy(i) + 4} className="coordinate-id">
            x
            <tspan baselineShift="sub" fontSize="8">
              {c.i}
            </tspan>
          </text>
          <text x="118" y={iy(i) + 4} textAnchor="end" className="coordinate-value">
            {fmt(c.x)}
          </text>
          <circle cx={ix} cy={iy(i)} r="4" fill={c.v < 0 ? '#d29178' : '#4d9cac'} />
        </g>
      ))}
      {visibleOutputs.map((i) => (
        <g
          key={i}
          className="neuron-node"
          tabIndex={0}
          role="button"
          aria-label={'Inspect neuron ' + i}
          onClick={() => onSelect(i)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onSelect(i);
            }
          }}
        >
          <rect
            x={ox - 14}
            y={oy(i) - 7}
            width="155"
            height="15"
            fill="transparent"
            pointerEvents="all"
          />
          <circle
            cx={ox}
            cy={oy(i)}
            r={i === active ? 10 : 6}
            fill={i === active ? '#467ae0' : outputs[i] >= 0 ? '#a6c6cc' : '#e1b7a5'}
            stroke={i === active ? '#edf3ff' : 'white'}
            strokeWidth={i === active ? 4 : 2}
          />
          <text x={ox + 22} y={oy(i) + 4} className="coordinate-value">
            h
            <tspan baselineShift="sub" fontSize="8">
              {i}
            </tspan>
            <tspan dx="20">{fmt(outputs[i])}</tspan>
          </text>
        </g>
      ))}
      <rect x="235" y="268" width="282" height="29" rx="5" fill="#f4f7fc" />
      <text x="248" y="287" className="schematic-note">
        bias {fmt(bias[active] ?? 0)} · remaining {ranked.length - shown.length} terms {fmt(others)}
      </text>
    </svg>
  );
}
