import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Check, TriangleAlert } from 'lucide-react';
import { useLab, useToolState } from '../core/context';
import {
  atlasBanks,
  atlasLayout,
  effectiveMode,
  explainFeature,
  featureDeltas,
  featureLabel,
  findNormalizers,
  normalizersDiffer,
  rowValues,
  savedStatistics,
  standardizeRow,
  strongestFeature,
  familyLabel,
  type AtlasBank,
  type AtlasMode,
  type SavedNormalizer,
} from '../core/feature-atlas';
import { Empty, Equation, InspectLink, Label, Photo, fmt } from './Shared';
import type { Item } from '../core/types';
import './feature-atlas.css';

export interface FeatureAtlasProps {
  index: number;
  bankId?: string;
  onBankChange?: (id: string) => void;
  onInspectFamily?: (family: string) => void;
}

/** Standardized colours saturate at this many saved scale units. */
const Z_LIMIT = 2.5;
const MODES: { id: AtlasMode; name: string }[] = [
  { id: 'standardized', name: 'Standardized' },
  { id: 'raw', name: 'Raw' },
  { id: 'delta', name: 'Δ Intervention' },
];
const minus = (s: string) => s.replace('-', '−');
/** Cell text; tiny non-zero values keep their sign instead of rounding to 0. */
function short(v: number, digits: number, signed = false) {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  if (Math.abs(v) < 0.5 * 10 ** -digits) return v < 0 ? '−0' : '+0';
  const text = minus(fmt(v, digits).replace(/^(-?)0\./, '$1.'));
  return signed && v > 0 ? '+' + text : text;
}
const tex = (x: number, d = 4) => (Number.isFinite(x) ? String(+x.toFixed(d)) : '\\text{—}');
const texTerm = (x: number, d = 4) => (x < 0 ? '(' + tex(x, d) + ')' : tex(x, d));
/** Pick the higher-contrast foreground from the actual sRGB mixture below. */
function cellInk(positive: boolean, mix: number, dark: boolean) {
  const base = dark ? [26, 34, 48] : [243, 245, 249];
  const pigment = dark
    ? positive
      ? [238, 138, 99]
      : [108, 156, 245]
    : positive
      ? [212, 99, 63]
      : [47, 107, 216];
  const linear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (rgb: number[]) =>
    rgb.reduce((sum, v, i) => sum + linear(v / 255) * [0.2126, 0.7152, 0.0722][i], 0);
  const background = luminance(base.map((v, i) => v * (1 - mix) + pigment[i] * mix));
  const darkInk = luminance([13, 18, 25]);
  return (background + 0.05) / (darkInk + 0.05) > 1.05 / (background + 0.05) ? '#0d1219' : '#fff';
}

export function FeatureAtlas({ index, bankId, onBankChange, onInspectFamily }: FeatureAtlasProps) {
  const { dataset, intervened, intervention } = useLab();
  const m = dataset.manifest;
  const colsOf = useCallback(
    (id: string) => dataset.matrices.get(id)?.cols ?? dataset.graphValues?.get(id)?.cols,
    [dataset],
  );
  const banks = useMemo(() => atlasBanks(m, colsOf), [m, colsOf]);
  const [localBank, setLocalBank] = useState<string>();
  const bank =
    banks.find((b) => b.id === bankId) ?? banks.find((b) => b.id === localBank) ?? banks[0];
  const layout = useMemo(() => (bank ? atlasLayout(bank) : null), [bank]);
  const normalizersOf = useCallback(
    (b: AtlasBank | undefined) => (b ? findNormalizers(m.model, b.features, colsOf) : []),
    [m, colsOf],
  );
  const normalizers = useMemo(() => normalizersOf(bank), [normalizersOf, bank]);
  const baseline = bank ? dataset.matrices.get(bank.features) : undefined;
  const affected = !!bank && intervened.has(bank.features);
  const current = affected ? intervened.get(bank.features) : baseline;
  const item = m.items[index];

  const [mode, setMode] = useToolState<AtlasMode>('featureAtlas.mode', 'standardized');
  const [normalizerId, setNormalizerId] = useToolState(
    'featureAtlas.normalizer',
    normalizers[0]?.id ?? '',
  );
  const normalizer = normalizers.find((n) => n.id === normalizerId) ?? normalizers[0];
  const values = useMemo(() => {
    const raw = rowValues(current, index),
      base = rowValues(baseline, index);
    return {
      raw,
      base,
      z: standardizeRow(raw, normalizer),
      delta: baseline ? featureDeltas(baseline, current, index) : new Float64Array(),
    };
  }, [current, baseline, index, normalizer]);
  const [feature, setFeature] = useToolState('featureAtlas.feature', () =>
    strongestFeature(values.z ?? values.raw),
  );
  if (!bank || !layout || !baseline || !item)
    return (
      <div className="feature-atlas fa-empty" data-capture="features.atlas">
        <Empty title="No feature matrix">
          This dataset has no query bank or features representation to lay out as an atlas.
        </Empty>
      </div>
    );
  const width = bank.width;
  const j =
    Number.isInteger(feature) && feature >= 0 && feature < width
      ? feature
      : strongestFeature(values.z ?? values.raw);
  const shown = effectiveMode(mode, !!normalizer);
  const valueAt = (k: number) =>
    shown === 'standardized' ? values.z![k] : shown === 'delta' ? values.delta[k] : values.raw[k];
  let limit = Z_LIMIT;
  if (shown !== 'standardized') {
    limit = 0;
    for (let k = 0; k < width; k++) {
      const v = valueAt(k);
      if (Number.isFinite(v)) limit = Math.max(limit, Math.abs(v));
    }
  }
  const digits = shown === 'standardized' ? 1 : limit && limit < 0.1 ? 3 : 2;
  const cellStyle = (v: number): CSSProperties => {
    if (!Number.isFinite(v) || !limit || v === 0) return {};
    const t = Math.min(1, Math.abs(v) / limit);
    const percentage = Math.round(12 + 78 * t);
    return {
      background: `color-mix(in srgb, var(${v > 0 ? '--fa-hi' : '--fa-lo'}) ${percentage}%, var(--fa-cell))`,
      '--fa-ink-on-light': cellInk(v > 0, percentage / 100, false),
      '--fa-ink-on-dark': cellInk(v > 0, percentage / 100, true),
    } as CSSProperties;
  };
  const defs = bank.definitions;
  const nameOf = (k: number) => (defs ? featureLabel(defs[k]) : 'Coordinate x' + k);
  const selectBank = (id: string) => {
    const next = banks.find((b) => b.id === id);
    if (!next) return;
    setLocalBank(id);
    onBankChange?.(id);
    const n = normalizersOf(next)[0],
      raw = rowValues(dataset.matrices.get(next.features), index);
    setNormalizerId(n?.id ?? '');
    setFeature(strongestFeature(standardizeRow(raw, n) ?? raw));
  };
  const cell = (k: number | null, key: string, rowLabel: string) =>
    k == null ? (
      <span key={key} className="fa-cell fa-void" aria-hidden />
    ) : (
      <button
        key={key}
        className={'fa-cell' + (k === j ? ' on' : '')}
        style={cellStyle(valueAt(k))}
        onClick={() => setFeature(k)}
        aria-pressed={k === j}
        aria-label={nameOf(k) + ' · ' + fmt(valueAt(k), 4)}
        title={`${nameOf(k)}\n${rowLabel} · ${fmt(valueAt(k), 4)}`}
      >
        {short(valueAt(k), digits, shown === 'delta')}
      </button>
    );
  const bankSelectable =
    banks.length > 1 && (!!onBankChange || !banks.some((b) => b.id === bankId));
  const unit =
    shown === 'standardized'
      ? `Saved-scale units · z = (x − μ) / σ with ${normalizer!.id}`
      : shown === 'delta'
        ? 'Intervened − baseline, raw feature units'
        : 'Raw feature values as stored in ' + bank.features;
  return (
    <div className="feature-atlas">
      <section className="fa-atlas" data-capture="features.atlas">
        <div className="fa-toolbar">
          <div className="segmented" aria-label="Atlas values">
            {MODES.map((o) => (
              <button
                key={o.id}
                className={shown === o.id ? 'active' : ''}
                aria-pressed={shown === o.id}
                disabled={o.id === 'standardized' && !normalizer}
                title={
                  o.id === 'standardized' && !normalizer
                    ? 'No saved normalize node reads this matrix'
                    : undefined
                }
                onClick={() => setMode(o.id)}
              >
                {o.name}
              </button>
            ))}
          </div>
          {bankSelectable && (
            <select
              aria-label="Feature bank"
              value={bank.id}
              onChange={(e) => selectBank(e.target.value)}
            >
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {normalizers.length > 1 && (
            <select
              aria-label="Saved normalization"
              value={normalizer?.id}
              onChange={(e) => setNormalizerId(e.target.value)}
            >
              {normalizers.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.id}
                  {n.via ? ' · via ' + n.via : ''}
                </option>
              ))}
            </select>
          )}
          <span className={'fa-state' + (affected ? ' live' : '')}>
            {affected ? 'Intervention applied' : 'Baseline'}
          </span>
        </div>
        {mode === 'standardized' && !normalizer && (
          <p className="fa-disclosure">
            <TriangleAlert size={12} /> No saved normalization reads {bank.features}; raw values are
            shown. Standard deviations are not estimated from the loaded rows.
          </p>
        )}
        <div className="fa-scroll">
          <div
            className={'fa-grid' + (layout.flat ? ' flat' : '')}
            style={{ '--fa-cols': layout.columns.length } as CSSProperties}
            role="group"
            aria-label={bank.name + ' feature atlas'}
          >
            <span className="fa-corner">{layout.flat ? 'coordinates' : 'family'}</span>
            {layout.columns.map((c) => (
              <span key={c.key} className="fa-colhead" title={c.title}>
                {c.label}
              </span>
            ))}
            {layout.rows.map((r) => (
              <div key={r.key} className="fa-row">
                <span className="fa-rowhead" title={r.family ?? r.label}>
                  {r.label}
                </span>
                {r.cells.map((k, c) => cell(k, r.key + c, r.label))}
              </div>
            ))}
          </div>
          {layout.global.length > 0 && (
            <div className="fa-global">
              {layout.global.map((k) => (
                <button
                  key={k}
                  className={'fa-cell fa-wide' + (k === j ? ' on' : '')}
                  style={cellStyle(valueAt(k))}
                  onClick={() => setFeature(k)}
                  aria-pressed={k === j}
                >
                  <span>{nameOf(k)}</span>
                  <b>{short(valueAt(k), digits + 1, shown === 'delta')}</b>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="fa-legend">
          <div className="fa-ramp" aria-hidden>
            <i />
          </div>
          <div className="fa-ticks">
            <span>{limit ? '−' + +limit.toPrecision(3) : '0'}</span>
            <span>0</span>
            <span>{limit ? '+' + +limit.toPrecision(3) : '0'}</span>
          </div>
          <p>
            {unit}.{' '}
            {shown === 'standardized'
              ? `Colour saturates at ±${Z_LIMIT}; cells show z.`
              : shown === 'delta' && !limit
                ? affected
                  ? 'The intervention leaves every feature of this item unchanged.'
                  : 'No intervention recomputes this bank, so every delta is 0.'
                : 'Colour saturates at the largest magnitude for this item.'}{' '}
            Signed: <em className="fa-key hi">above 0</em>, <em className="fa-key lo">below 0</em>.
          </p>
        </div>
        {bank.note && <p className="fa-disclosure">{bank.note}</p>}
      </section>
      <Inspector
        k={j}
        bank={bank}
        item={item}
        values={values}
        affected={affected}
        normalizer={normalizer}
        normalizers={normalizers}
        similarities={
          bank.similarities ? rowValues(dataset.matrices.get(bank.similarities), index) : undefined
        }
        intervention={intervention}
        onInspectFamily={onInspectFamily}
      />
    </div>
  );
}

function Inspector({
  k,
  bank,
  item,
  values,
  affected,
  normalizer,
  normalizers,
  similarities,
  intervention,
  onInspectFamily,
}: {
  k: number;
  bank: AtlasBank;
  item: Item;
  values: {
    raw: ArrayLike<number>;
    base: ArrayLike<number>;
    z: Float64Array | null;
    delta: Float64Array;
  };
  affected: boolean;
  normalizer?: SavedNormalizer;
  normalizers: SavedNormalizer[];
  similarities?: ArrayLike<number>;
  intervention: ReturnType<typeof useLab>['intervention'];
  onInspectFamily?: (family: string) => void;
}) {
  const def = bank.definitions?.[k];
  const options = affected
    ? intervention
    : { disabled: [], temperature: null, zeroFamilies: [] as string[] };
  const explained = useMemo(
    () =>
      def && bank.queries && similarities && similarities.length === bank.queries.length
        ? {
            current: explainFeature(def, bank.queries, similarities, options),
            baseline: affected ? explainFeature(def, bank.queries, similarities) : null,
          }
        : null,
    [def, bank, similarities, affected, intervention],
  );
  const raw = values.raw[k],
    base = values.base[k],
    delta = values.delta[k];
  const stats = normalizer ? savedStatistics(normalizer, k) : null;
  const z = values.z?.[k] ?? NaN;
  const check = (recomputed: number, stored: number) =>
    Math.abs(recomputed - stored) <= 1e-4 * Math.max(1, Math.abs(stored));
  const differ = normalizers.length > 1 && normalizersDiffer(normalizers, bank.width);
  return (
    <aside className="fa-inspector" data-capture="features.inspector">
      <header className="fa-head">
        <Photo item={item} label={false} className="fa-thumb" />
        <div>
          <Label>
            COLUMN {k} OF {bank.width} · {bank.features}
          </Label>
          <h3>{def ? featureLabel(def) : 'Coordinate x' + k}</h3>
          <code title={def?.name}>{def?.name ?? bank.features + '[' + k + ']'}</code>
        </div>
      </header>
      {def && explained ? (
        <div className="fa-block">
          <Label>OPERATOR · FROM SAVED METADATA</Label>
          <Equation>{explained.current.general}</Equation>
          <span className="fa-caption">
            {affected ? 'Under the current intervention' : 'With this item’s saved similarities'}
          </span>
          <Equation>{explained.current.substituted}</Equation>
          {explained.current.sets.map((s) => (
            <div key={s.symbol} className={'fa-set ' + s.polarity}>
              <div className="fa-set-head">
                <b>{s.symbol}</b>
                <span>
                  {s.polarity} phrases · {s.scope}
                </span>
                <small>
                  {s.active}/{s.total} active
                </small>
              </div>
              {s.phrases.slice(0, 3).map((p, r) => (
                <div key={p.id} className={'fa-phrase' + (p.disabled ? ' off' : '')}>
                  <span title={p.text}>{p.text}</span>
                  <b>{p.disabled ? 'removed' : fmt(p.value, 4)}</b>
                  {r === 0 && !p.disabled && <i>max</i>}
                </div>
              ))}
              {s.phrases.length > 3 && (
                <small className="fa-more">+{s.phrases.length - 3} more in this set</small>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="fa-block">
          <Label>OPERATOR</Label>
          <p className="fa-note">
            {def
              ? 'Saved similarities for this bank are unavailable, so the operator cannot be re-evaluated here.'
              : 'No operator metadata is supplied for this coordinate. Its value is read directly from ' +
                bank.features +
                '.'}
          </p>
        </div>
      )}
      <div className="fa-block">
        <Label>VALUES</Label>
        <dl className="fa-values">
          <dt>Raw · baseline</dt>
          <dd>{fmt(base, 4)}</dd>
          {affected && (
            <>
              <dt>Raw · intervened</dt>
              <dd>{fmt(raw, 4)}</dd>
            </>
          )}
          <dt>Δ intervened − baseline</dt>
          <dd>{minus(fmt(delta, 4))}</dd>
          {stats && (
            <>
              <dt>
                Saved mean μ<sub>{stats.column}</sub>
              </dt>
              <dd>{fmt(stats.mean, 4)}</dd>
              <dt>
                Saved scale σ<sub>{stats.column}</sub>
              </dt>
              <dd>{fmt(stats.scale, 4)}</dd>
              <dt>Standardized z</dt>
              <dd>
                <strong>{fmt(z, 3)}</strong>
              </dd>
              <dt>Δz = Δ / σ</dt>
              <dd>{minus(fmt(delta / stats.scale, 3))}</dd>
            </>
          )}
        </dl>
        {stats && (
          <Equation>{`z=\\frac{x-\\mu_{${stats.column}}}{\\sigma_{${stats.column}}}=\\frac{${tex(raw)}-${texTerm(stats.mean)}}{${tex(stats.scale)}}=${tex(z, 3)}`}</Equation>
        )}
        <p className="fa-note">
          {!normalizer
            ? `No saved normalize node reads ${bank.features}, so standardized values are unavailable. No statistics are estimated from the loaded rows.`
            : `Saved statistics from ${normalizer.id}${normalizer.name ? ' (' + normalizer.name + ')' : ''}, which reads ${bank.features} ${
                normalizer.via
                  ? `through ${normalizer.via} at columns ${normalizer.offset}–${normalizer.offset + bank.width - 1}`
                  : 'directly'
              }.` +
              (normalizers.length > 1
                ? differ
                  ? ` ${normalizers.length} saved normalize nodes read this matrix with different statistics; each is a separate path through the model. This one is ${normalizer === normalizers[0] ? 'the first direct reader in graph order' : 'your selection'}.`
                  : ` ${normalizers.length} saved normalize nodes read this matrix with identical statistics.`
                : '')}
        </p>
      </div>
      {explained && (
        <div className="fa-block fa-checks">
          {[
            {
              label: 'Baseline',
              e: explained.baseline ?? (affected ? null : explained.current),
              stored: base,
            },
            ...(affected ? [{ label: 'Intervened', e: explained.current, stored: raw }] : []),
          ]
            .filter((x) => x.e && x.e.status !== 'unavailable')
            .map(({ label, e, stored }) => (
              <div key={label} className={check(e!.value, stored) ? 'ok' : 'warn'}>
                {check(e!.value, stored) ? <Check size={12} /> : <TriangleAlert size={12} />}
                <span>
                  {label}: recomputed {fmt(e!.value, 4)} · stored {fmt(stored, 4)}
                  {check(e!.value, stored)
                    ? ''
                    : ' — they differ; the stored matrix was not produced by this operator as described.'}
                </span>
              </div>
            ))}
          {explained.current.notes.map((n) => (
            <p key={n} className="fa-note">
              {n}
            </p>
          ))}
        </div>
      )}
      {def?.family && onInspectFamily && (
        <InspectLink onClick={() => onInspectFamily(def.family!)}>
          Inspect {familyLabel(def.family)} operators
        </InspectLink>
      )}
    </aside>
  );
}
