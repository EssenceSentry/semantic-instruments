import { lse } from './math';
import type {
  FeatureDefinition,
  GraphNode,
  Intervention,
  Manifest,
  Matrix,
  ModelGraph,
  Query,
} from './types';

/** Colour and value modes shared by the atlas UI and the scene API. */
export type AtlasMode = 'raw' | 'standardized' | 'delta';
export const ATLAS_MODES: AtlasMode[] = ['standardized', 'raw', 'delta'];

/** A features matrix the atlas can display, with pooling metadata when supplied. */
export interface AtlasBank {
  id: string;
  name: string;
  features: string;
  width: number;
  similarities?: string;
  queries?: Query[];
  /** Present only when one definition exists for every column. */
  definitions?: FeatureDefinition[];
  /** Why operator metadata could not be used, when it was partially supplied. */
  note?: string;
}

/**
 * Every features matrix in the manifest. Query banks come first; features
 * representations that no bank produces are listed as flat coordinate banks.
 */
export function atlasBanks(
  manifest: Manifest,
  colsOf: (id: string) => number | undefined = () => undefined,
): AtlasBank[] {
  const repName = (id: string) => manifest.representations.find((r) => r.id === id)?.name;
  const width = (id: string) =>
    colsOf(id) ?? manifest.representations.find((r) => r.id === id)?.dimensions ?? 0;
  const banks: AtlasBank[] = [];
  for (const bank of manifest.queries ?? []) {
    const w = width(bank.features);
    if (!w) continue;
    const defs = manifest.featureDefinitions?.[bank.id];
    const valid = !!defs && defs.length === w;
    banks.push({
      id: bank.id,
      name: repName(bank.features) ?? bank.id + ' features',
      features: bank.features,
      width: w,
      similarities: bank.similarities,
      queries: bank.items,
      definitions: valid ? defs : undefined,
      note: !defs
        ? 'No feature definitions were supplied for this bank.'
        : valid
          ? undefined
          : `${defs.length} definitions were supplied for ${w} columns, so operator metadata is not applied.`,
    });
  }
  const used = new Set(banks.map((b) => b.features));
  for (const rep of manifest.representations) {
    if (rep.kind !== 'features' || used.has(rep.id)) continue;
    const w = width(rep.id);
    if (!w) continue;
    banks.push({
      id: banks.some((b) => b.id === rep.id) ? 'features:' + rep.id : rep.id,
      name: rep.name,
      features: rep.id,
      width: w,
      note: 'No pooling metadata accompanies this representation; coordinates are shown as supplied.',
    });
  }
  return banks;
}

export interface AtlasColumn {
  key: string;
  label: string;
  title: string;
}
export interface AtlasRow {
  key: string;
  label: string;
  family?: string;
  /** Feature index per column, or null where this row has no such operator. */
  cells: (number | null)[];
}
export interface AtlasLayout {
  flat: boolean;
  columns: AtlasColumn[];
  rows: AtlasRow[];
  /** Features without a family (for example group margins), shown separately. */
  global: number[];
}

const KIND_ORDER: FeatureDefinition['kind'][] = [
  'max',
  'margin',
  'gate',
  'second',
  'gap',
  'lse',
  'groupMargin',
];
const KIND_LABEL: Record<FeatureDefinition['kind'], string> = {
  max: 'max',
  second: '2nd',
  gap: 'gap',
  margin: 'margin',
  gate: 'gate',
  lse: 'LSE',
  groupMargin: 'group margin',
};
const KIND_NAME: Record<FeatureDefinition['kind'], string> = {
  max: 'strongest similarity',
  second: 'second-strongest similarity',
  gap: 'top-two gap',
  margin: 'positive − negative margin',
  gate: 'gated positive',
  lse: 'log-sum-exp pool',
  groupMargin: 'best positive − best negative across all families',
};
const sign = (p: FeatureDefinition['polarity']) =>
  p === 'positive' ? '+' : p === 'negative' ? '−' : '';
export const familyLabel = (family: string) => family.replaceAll('_', ' ');
const tau = (t: number) => String(+t.toPrecision(3));

/** Short operator label used for column headers, derived only from metadata. */
export function operatorLabel(def: FeatureDefinition) {
  const t = def.kind === 'lse' && def.temperature != null ? ' τ' + tau(def.temperature) : '';
  const p = sign(def.polarity);
  return KIND_LABEL[def.kind] + t + (p ? ' ' + p : '');
}
export function featureLabel(def: FeatureDefinition) {
  return [
    def.family ? familyLabel(def.family) : 'All families',
    KIND_NAME[def.kind] ?? def.kind,
    def.polarity ?? '',
    def.kind === 'lse' && def.temperature != null ? 'τ = ' + tau(def.temperature) : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
function columnKey(def: FeatureDefinition) {
  return [def.kind, def.polarity ?? '', def.kind === 'lse' ? (def.temperature ?? '') : ''].join(
    '|',
  );
}
function columnRank(key: string) {
  const [kind, polarity, temperature] = key.split('|');
  return [
    KIND_ORDER.indexOf(kind as FeatureDefinition['kind']),
    -(temperature === '' ? Infinity : +temperature),
    polarity === 'positive' ? 0 : polarity === 'negative' ? 1 : 2,
  ];
}

/**
 * Family rows × operator columns from definitions. Columns are only those that
 * occur; identical operators within one family receive separate columns
 * rather than overwriting each other.
 */
export function atlasLayout(bank: AtlasBank, flatColumns = 12): AtlasLayout {
  const defs = bank.definitions;
  if (!defs) {
    const cols = Math.max(1, Math.min(flatColumns, bank.width)),
      rows = Math.ceil(bank.width / cols);
    return {
      flat: true,
      columns: Array.from({ length: cols }, (_, k) => ({
        key: String(k),
        label: '+' + k,
        title: 'Coordinate offset ' + k + ' within the row',
      })),
      rows: Array.from({ length: rows }, (_, r) => ({
        key: 'x' + r,
        label:
          'x' + r * cols + (cols > 1 ? '–' + Math.min(bank.width - 1, r * cols + cols - 1) : ''),
        cells: Array.from({ length: cols }, (_, k) =>
          r * cols + k < bank.width ? r * cols + k : null,
        ),
      })),
      global: [],
    };
  }
  const families: string[] = [],
    placed = new Map<string, Map<string, number>>(),
    columns = new Map<string, FeatureDefinition>(),
    global: number[] = [];
  defs.forEach((def, j) => {
    if (!def.family) {
      global.push(j);
      return;
    }
    if (!placed.has(def.family)) {
      families.push(def.family);
      placed.set(def.family, new Map());
    }
    const row = placed.get(def.family)!,
      base = columnKey(def);
    let key = base,
      n = 1;
    while (row.has(key)) key = base + '#' + ++n;
    row.set(key, j);
    if (!columns.has(key)) columns.set(key, def);
  });
  const keys = [...columns.keys()].sort((a, b) => {
    const [ra, rb] = [columnRank(a.split('#')[0]), columnRank(b.split('#')[0])];
    for (let k = 0; k < ra.length; k++) if (ra[k] !== rb[k]) return ra[k] - rb[k];
    return a.localeCompare(b);
  });
  return {
    flat: false,
    columns: keys.map((key) => {
      const def = columns.get(key)!,
        copy = key.includes('#') ? ' #' + key.split('#')[1] : '';
      return {
        key,
        label: operatorLabel(def) + copy,
        title:
          (KIND_NAME[def.kind] ?? def.kind) + (def.polarity ? ' · ' + def.polarity : '') + copy,
      };
    }),
    rows: families.map((family) => ({
      key: family,
      family,
      label: familyLabel(family),
      cells: keys.map((key) => placed.get(family)!.get(key) ?? null),
    })),
    global,
  };
}

/** A saved normalize node that reads this features matrix, possibly through concat. */
export interface SavedNormalizer {
  id: string;
  name?: string;
  /** First column of this features matrix inside the node's input. */
  offset: number;
  /** Concat node the features pass through, when not read directly. */
  via?: string;
  mean: number[];
  scale: number[];
}

/** Output width of every graph node, from saved parameters and input matrices. */
export function nodeWidths(model: ModelGraph, colsOf: (id: string) => number | undefined) {
  const widths = new Map<string, number>();
  const width = (id: string) => widths.get(id) ?? colsOf(id);
  for (const id of model.inputs) {
    const w = colsOf(id);
    if (w != null) widths.set(id, w);
  }
  for (const n of model.nodes) {
    let w: number | undefined;
    if (n.op === 'normalize') w = n.mean?.length;
    else if (n.op === 'dense') w = n.weight?.length;
    else if (n.op === 'concat') {
      const parts = n.inputs.map(width);
      w = parts.every((x) => x != null) ? parts.reduce((a, b) => a! + b!, 0) : undefined;
    } else w = width(n.inputs[0]);
    if (w != null) widths.set(n.id, w);
  }
  return widths;
}

/**
 * Saved normalize nodes whose input contains this features matrix unchanged,
 * either directly or as a segment of a concat. Direct readers come first; the
 * graph order is kept otherwise. No statistics are estimated from the data.
 */
export function findNormalizers(
  model: ModelGraph | undefined,
  features: string,
  colsOf: (id: string) => number | undefined,
): SavedNormalizer[] {
  if (!model) return [];
  const width = colsOf(features);
  if (!width) return [];
  const widths = nodeWidths(model, colsOf),
    placement = new Map<string, number>([[features, 0]]),
    out: SavedNormalizer[] = [];
  for (const n of model.nodes as GraphNode[]) {
    if (n.op === 'concat') {
      let offset = 0;
      for (const input of n.inputs) {
        if (placement.has(input)) {
          placement.set(n.id, offset + placement.get(input)!);
          break;
        }
        const w = widths.get(input) ?? colsOf(input);
        if (w == null) break;
        offset += w;
      }
    } else if (n.op === 'normalize' && placement.has(n.inputs[0])) {
      const offset = placement.get(n.inputs[0])!;
      if (n.mean && n.scale && n.mean.length >= offset + width && n.scale.length >= offset + width)
        out.push({
          id: n.id,
          name: n.name,
          offset,
          via: n.inputs[0] === features ? undefined : n.inputs[0],
          mean: n.mean,
          scale: n.scale,
        });
    }
  }
  return out.sort((a, b) => Number(!!a.via) - Number(!!b.via));
}

/** Whether saved normalizers disagree on this matrix's columns. */
export function normalizersDiffer(normalizers: SavedNormalizer[], width: number) {
  const [first, ...rest] = normalizers;
  return rest.some((n) => {
    for (let j = 0; j < width; j++)
      if (
        n.mean[n.offset + j] !== first.mean[first.offset + j] ||
        n.scale[n.offset + j] !== first.scale[first.offset + j]
      )
        return true;
    return false;
  });
}

export function savedStatistics(n: SavedNormalizer, j: number) {
  return { mean: n.mean[n.offset + j], scale: n.scale[n.offset + j], column: n.offset + j };
}
/** (x − μ) / σ with the saved statistics, exactly as the normalize node applies them. */
export function standardizeValue(x: number, n: SavedNormalizer, j: number) {
  const { mean, scale } = savedStatistics(n, j);
  return (x - mean) / scale;
}
export function standardizeRow(values: ArrayLike<number>, n: SavedNormalizer | undefined) {
  if (!n) return null;
  return Float64Array.from(values, (x, j) => standardizeValue(x, n, j));
}

export function rowValues(m: Matrix | undefined, index: number) {
  return m && index >= 0 && index < m.rows
    ? m.data.subarray(index * m.cols, (index + 1) * m.cols)
    : new Float32Array();
}
/** Current minus baseline for one row. Without an intervened matrix every delta is zero. */
export function featureDeltas(baseline: Matrix, current: Matrix | undefined, index: number) {
  const base = rowValues(baseline, index);
  if (!current || current === baseline) return new Float64Array(base.length);
  const now = rowValues(current, index);
  return Float64Array.from(base, (x, j) => now[j] - x);
}

/** Index of the largest finite magnitude, or 0 when none exists. */
export function strongestFeature(values: ArrayLike<number> | null) {
  let best = 0,
    size = -1;
  if (values)
    for (let j = 0; j < values.length; j++)
      if (Number.isFinite(values[j]) && Math.abs(values[j]) > size) {
        size = Math.abs(values[j]);
        best = j;
      }
  return best;
}
export function effectiveMode(mode: AtlasMode, hasNormalizer: boolean): AtlasMode {
  return mode === 'standardized' && !hasNormalizer
    ? 'raw'
    : ATLAS_MODES.includes(mode)
      ? mode
      : 'raw';
}

export interface ExplainedPhrase {
  id: string;
  text: string;
  value: number;
  disabled: boolean;
}
export interface ExplainedSet {
  symbol: 'P' | 'N';
  polarity: 'positive' | 'negative';
  scope: string;
  active: number;
  total: number;
  /** Active phrases, strongest first, followed by removed ones. */
  phrases: ExplainedPhrase[];
}
export interface FeatureExplanation {
  status: 'ok' | 'zeroed' | 'unavailable';
  value: number;
  general: string;
  substituted: string;
  sets: ExplainedSet[];
  notes: string[];
}
type Options = Pick<Intervention, 'disabled' | 'temperature' | 'zeroFamilies' | 'countNeutral'>;
const n4 = (x: number) => (Number.isFinite(x) ? String(+x.toFixed(4)) : '\\text{—}');
const term = (x: number) => (x < 0 ? '(' + n4(x) + ')' : n4(x));

/**
 * Recompute one pooled feature from saved query similarities, with the same
 * semantics as poolFeatures, and describe each input that determined it.
 */
export function explainFeature(
  def: FeatureDefinition,
  queries: Query[],
  similarities: ArrayLike<number>,
  options: Options = { disabled: [], temperature: null, zeroFamilies: [] },
): FeatureExplanation {
  const off = new Set(options.disabled),
    notes: string[] = [];
  const setOf = (polarity: 'positive' | 'negative', family?: string): ExplainedSet => {
    const members = queries
      .map((q, j) => ({ q, value: similarities[j] }))
      .filter(({ q }) => q.polarity === polarity && (family == null || q.family === family))
      .map(({ q, value }) => ({ id: q.id, text: q.text, value, disabled: off.has(q.id) }))
      .sort((a, b) => Number(a.disabled) - Number(b.disabled) || b.value - a.value);
    return {
      symbol: polarity === 'positive' ? 'P' : 'N',
      polarity,
      scope: family == null ? 'every family' : familyLabel(family),
      active: members.filter((m) => !m.disabled).length,
      total: members.length,
      phrases: members,
    };
  };
  const active = (s: ExplainedSet) => s.phrases.filter((p) => !p.disabled).map((p) => p.value);
  const empty = (s: ExplainedSet) => {
    if (!s.active)
      notes.push(
        `No active ${s.polarity} phrase in ${s.scope}; the pooling code substitutes 0 for this side.`,
      );
  };
  if (def.family && options.zeroFamilies.includes(def.family))
    return {
      status: 'zeroed',
      value: 0,
      general: String.raw`f = 0`,
      substituted: String.raw`f = 0`,
      sets: [],
      notes: [`The current intervention sets every ${familyLabel(def.family)} feature to 0.`],
    };
  if (def.kind === 'groupMargin') {
    const P = setOf('positive'),
      N = setOf('negative'),
      a = active(P)[0] ?? 0,
      b = active(N)[0] ?? 0;
    empty(P);
    empty(N);
    return {
      status: 'ok',
      value: a - b,
      general: String.raw`f=\max_{j\in P}s_j-\max_{j\in N}s_j`,
      substituted: `f=${term(a)}-${term(b)}=${n4(a - b)}`,
      sets: [P, N],
      notes,
    };
  }
  if (!def.family || !queries.some((q) => q.family === def.family))
    return {
      status: 'unavailable',
      value: NaN,
      general: String.raw`f=\;?`,
      substituted: String.raw`f=\;?`,
      sets: [],
      notes: [
        def.family
          ? `The definition names family “${def.family}”, which does not occur in this query bank, so the value cannot be recomputed.`
          : `The definition records kind “${def.kind}” but no family, so its inputs cannot be identified.`,
      ],
    };
  const P = setOf('positive', def.family),
    N = setOf('negative', def.family),
    a = active(P)[0] ?? 0,
    b = active(N)[0] ?? 0;
  if (def.kind === 'margin' || def.kind === 'gate') {
    empty(P);
    empty(N);
    const value = def.kind === 'margin' ? a - b : a > b ? a : 0;
    return {
      status: 'ok',
      value,
      general:
        def.kind === 'margin'
          ? String.raw`f=a-b,\quad a=\max_{j\in P}s_j,\; b=\max_{j\in N}s_j`
          : String.raw`f=a\,\mathbf 1[a>b],\quad a=\max_{j\in P}s_j,\; b=\max_{j\in N}s_j`,
      substituted:
        def.kind === 'margin'
          ? `f=${term(a)}-${term(b)}=${n4(value)}`
          : `f=${term(a)}\\cdot\\mathbf 1[${n4(a)}>${n4(b)}]=${n4(value)}`,
      sets: [P, N],
      notes,
    };
  }
  if (def.polarity !== 'positive' && def.polarity !== 'negative')
    notes.push('Polarity is not recorded; the pooling code evaluates the positive side.');
  const side = def.polarity === 'negative' ? N : P,
    S = side.symbol,
    xs = active(side);
  empty(side);
  let value = 0,
    general = '',
    substituted = '';
  if (def.kind === 'max') {
    value = xs[0] ?? 0;
    general = String.raw`f=\max_{j\in ${S}}s_j`;
    substituted = `f=${n4(value)}`;
  } else if (def.kind === 'second') {
    value = xs[1] ?? xs[0] ?? 0;
    if (xs.length === 1)
      notes.push('Only one active phrase; the pooling code repeats the strongest value.');
    general = String.raw`f=s_{(2)},\quad s_{(1)}\ge s_{(2)}\ge\dots\text{ over }${S}`;
    substituted = `f=${n4(value)}`;
  } else if (def.kind === 'gap') {
    const s1 = xs[0] ?? 0,
      s2 = xs[1] ?? xs[0] ?? 0;
    value = s1 - s2;
    if (xs.length === 1) notes.push('Only one active phrase, so the gap is 0 by construction.');
    general = String.raw`f=s_{(1)}-s_{(2)}\text{ over }${S}`;
    substituted = `f=${term(s1)}-${term(s2)}=${n4(value)}`;
  } else if (def.kind === 'lse') {
    const t = options.temperature ?? def.temperature ?? 1;
    if (options.temperature != null)
      notes.push(`The current intervention overrides the saved temperature with τ = ${tau(t)}.`);
    else if (def.temperature == null)
      notes.push('Temperature is not recorded; the pooling code uses τ = 1.');
    const correction =
      xs.length && t > 0 && options.countNeutral ? t * Math.log(side.total / xs.length) : 0;
    value = xs.length ? lse(xs, t) + correction : 0;
    const shown = xs.slice(0, 3).map((x) => `e^{${n4(x)}/${tau(t)}}`);
    general = String.raw`f=\tau\log\sum_{j\in ${S}}e^{s_j/\tau}`;
    substituted = xs.length
      ? `f=${tau(t)}\\log\\left(${shown.join('+')}${xs.length > 3 ? `+\\dots` : ''}\\right)=${n4(value)}` +
        (xs.length > 3 ? `\\quad(${xs.length}\\text{ terms})` : '')
      : 'f=0';
    if (options.countNeutral && xs.length && t > 0) {
      general += String.raw`+\tau\log(N/|${S}|)`;
      substituted = `f=${n4(lse(xs, t))}+${tau(t)}\\log(${side.total}/${xs.length})=${n4(value)}`;
      notes.push(
        `Count-neutral removal preserves the original ${side.total}-phrase factor: the surviving exponential sum is multiplied by ${side.total}/${xs.length}.`,
      );
    } else if (xs.length > 1 && t > 0)
      notes.push(
        `With ${xs.length} terms the pool lies between max s and max s + τ·log ${xs.length} = max s + ${n4(t * Math.log(xs.length))}; it grows with the number of phrases.`,
      );
  }
  return { status: 'ok', value, general, substituted, sets: [side], notes };
}

/** Whether the intervention recomputed this features matrix. */
export function interventionAffects(intervened: Map<string, Matrix>, features: string) {
  return intervened.has(features);
}
