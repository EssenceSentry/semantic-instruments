import { indexGraph, branchRoots, ancestors } from './network-flow';
import { atlasBanks, findNormalizers } from './feature-atlas';
import type { Manifest, ToolId, Intervention } from './types';
import { defaultAuditScope } from './audit';
import { ranking } from './math';
import {
  primaryScore,
  probabilityScore,
  defaultFocusIndex,
  defaultComparisonIndex,
  defaultNetworkNode,
} from './capabilities';
import { TOUR_SCENES, sceneConfig, tourCapabilities, type TourScene } from './tour';

export const API_VERSION = '1.1.0';
export type Value = string | number | boolean | string[];
export interface Camera {
  zoom: number;
  panX: number;
  panY: number;
  angle: number;
}
export interface SceneSpec {
  schemaVersion: 1;
  dataset?: string;
  fingerprint?: string;
  scene: TourScene;
  representation?: string;
  selectedIds?: string[];
  pinnedIds?: string[];
  controls?: Record<string, Value>;
  seed?: number;
  time?: number;
  camera?: Partial<Camera>;
  intervention?: Intervention;
  auditBatches?: {
    band: number;
    ids: string[];
    positives: number;
    selectedIds?: string[];
    time: string;
  }[];
}
export interface Control {
  key: string;
  type: 'number' | 'integer' | 'boolean' | 'string' | 'strings';
  default: Value;
  options?: string[];
  min?: number;
  max?: number;
  description: string;
}
export function controlSchema(m: Manifest): Record<string, Control> {
  const items = m.items,
    reps = m.representations.map((r) => r.id),
    banks = m.queries ?? [];
  const scores = [...new Set(items.flatMap((i) => Object.keys(i.scores ?? {})))];
  const score = primaryScore(m),
    media = items.some((i) => i.media),
    n = items.length;
  const families = [...new Set(banks.flatMap((b) => b.items.map((q) => q.family)))];
  const fields: Record<string, Control> = {};
  const add = (
    name: string,
    key: string,
    value: Value,
    description: string,
    opts: Partial<Control> = {},
  ) => {
    fields[name] = {
      key,
      type: Array.isArray(value) ? 'strings' : (typeof value as Control['type']),
      default: value,
      description,
      ...opts,
    };
  };
  const num = (
    name: string,
    value: number,
    min: number,
    max: number,
    description: string,
    integer = false,
    key = name,
  ) => add(name, key, value, description, { type: integer ? 'integer' : 'number', min, max });
  const choice = (
    name: string,
    value: string,
    options: string[],
    description: string,
    key = name,
  ) => add(name, key, value, description, { options });
  const bool = (name: string, value: boolean, description: string) =>
    add(name, name, value, description);
  choice(
    'space.mode',
    m.representations[0].overview ? 'overview' : 'pca',
    ['overview', 'pca', 'boundary'],
    'Projection or query polarity coordinates',
  );
  choice(
    'space.other',
    reps[Math.min(2, reps.length - 1)],
    reps,
    'Representation in the comparison pane',
  );
  choice('space.color', 'score', ['score', 'label', 'split', 'outcome'], 'Point color encoding');
  bool('space.compare', false, 'Show a second linked space');
  bool('space.rotate', false, 'Rotate PCA using the scene clock');
  choice(
    'space.family',
    m.presets?.queryFamily ?? families[0] ?? '',
    families,
    'Query family for the polarity plane',
  );
  choice('space.metric', 'cosine', ['cosine', 'euclidean'], 'High-dimensional neighbor metric');
  bool('space.previewOnly', media, 'Restrict neighbor previews to records with media');
  choice('vector.representation', reps[0], reps, 'Vector representation', 'algebra.representation');
  add(
    'vector.otherItemId',
    'algebra.other',
    items[defaultComparisonIndex(m)].id,
    'Second vector, addressed by stable item ID',
  );
  choice(
    'vector.operation',
    'cosine',
    ['cosine', 'dot', 'distance', 'blend'],
    'Vector operation',
    'algebra.operation',
  );
  num('vector.alpha', 0.5, 0, 1, 'Interpolation weight', false, 'algebra.alpha');
  choice(
    'queries.bank',
    banks[0]?.id ?? '',
    banks.map((b) => b.id),
    'Query bank',
    'transform.bankId',
  );
  choice(
    'queries.family',
    m.presets?.queryFamily ?? families[0] ?? '',
    families,
    'Query family',
    'transform.2',
  );
  choice(
    'queries.operator',
    'boundary',
    ['boundary', 'top2', 'lse'],
    'Feature operator',
    'transform.operator',
  );
  add('queries.disabled', 'transform.disabled', [], 'Excluded query IDs', {
    options: banks.flatMap((b) => b.items.map((q) => q.id)),
  });
  num(
    'queries.temperature',
    0.25,
    0.01,
    1,
    'Log-sum-exp temperature',
    false,
    'transform.temperature',
  );
  add(
    'queries.countNeutral',
    'transform.countNeutral',
    true,
    'Preserve the original LSE phrase-count factor during removal',
  );
  add(
    'queries.temperatureOverride',
    'transform.temperatureOverride',
    false,
    'Explicitly override each saved LSE temperature',
  );
  choice(
    'features.bank',
    atlasBanks(m)[0]?.id ?? '',
    atlasBanks(m).map((b) => b.id),
    'Feature bank or supplied feature representation',
    'featureAtlas.bank',
  );
  choice(
    'features.mode',
    'standardized',
    ['raw', 'standardized', 'delta'],
    'Raw feature, saved standardized value, or intervention minus baseline',
    'featureAtlas.mode',
  );
  num(
    'features.coordinate',
    0,
    0,
    Math.max(
      0,
      ...m.representations.filter((r) => r.kind === 'features').map((r) => r.dimensions - 1),
    ),
    'Feature column to inspect',
    true,
    'featureAtlas.feature',
  );
  choice(
    'features.normalizer',
    '',
    ['', ...(m.model?.nodes.filter((n) => n.op === 'normalize').map((n) => n.id) ?? [])],
    'Saved normalization node; empty selects the first compatible node',
    'featureAtlas.normalizer',
  );
  choice(
    'network.view',
    'flow',
    ['flow', 'arithmetic'],
    'Complete graph flow or one dense-neuron calculation',
  );
  choice(
    'network.branch',
    '',
    ['', ...(m.model ? branchRoots(indexGraph(m.model)) : [])],
    'Graph branch to inspect; empty selects the first member',
    'networkFlow.branch',
  );
  choice(
    'network.node',
    defaultNetworkNode(m),
    m.model?.nodes.filter((n) => n.op === 'dense').map((n) => n.id) ?? [],
    'Dense node to inspect',
    'transform.8',
  );
  num('network.coordinate', 0, 0, 100000, 'Output neuron index', true, 'transform.coordinate');
  num(
    'network.inputOffset',
    0,
    -3,
    3,
    'Perturbation of the strongest input contribution',
    false,
    'transform.inputOffset',
  );
  choice(
    'reference.measure',
    score,
    scores,
    'Scalar used in the empirical CDF',
    'transform.measure',
  );
  choice(
    'reference.population',
    'all',
    ['all', ...new Set(items.map((i) => i.split).filter((x): x is string => !!x))],
    'Reference population',
    'transform.reference',
  );
  num(
    'reference.value',
    0,
    -1e12,
    1e12,
    'Value evaluated by the empirical CDF',
    false,
    'transform.sweepScore',
  );
  choice('compose.measure', score, scores, 'Quantity to aggregate');
  choice(
    'compose.groupBy',
    m.presets?.groupBy ?? (items.some((i) => i.group) ? 'group' : 'category'),
    ['group', 'category'],
    'Collection grouping',
    'compose.0',
  );
  choice(
    'compose.method',
    'topk',
    ['topk', 'mean', 'max', 'sum', 'rate', 'supported'],
    'Collection reducer',
  );
  num('compose.k', 20, 1, 50, 'Top-k aggregation size', true);
  num('compose.confidence', 0.95, 0.5, 0.99, 'Supported-count confidence');
  num('compose.threshold', 0.5, -1e12, 1e12, 'Flagged-fraction threshold');
  num('compose.extra', 0, 0, 100, 'Hypothetical added observations', true);
  num('compose.weak', 0.05, -1e12, 1e12, 'Value of each hypothetical addition');
  choice('compose.view', 'inventory', ['inventory', 'profile', 'dossier'], 'Collection view');
  choice(
    'compose.policy',
    'strongest',
    ['strongest', 'typical', 'counter', 'balanced'],
    'Evidence-selection policy',
  );
  bool('compose.previewTray', media, 'Use available image previews in the evidence tray');
  num('compose.slots', 8, 1, 100, 'Number of evidence slots', true);
  add('compose.chosen', 'compose.chosen', [], 'Up to two collection names');
  choice(
    'rank.left',
    m.presets?.ranking?.left ?? scores.find((k) => k !== score) ?? score,
    scores,
    'Left ranking',
  );
  choice('rank.right', m.presets?.ranking?.right ?? score, scores, 'Right ranking');
  choice('rank.rule', 'weighted', ['weighted', 'max', 'corroboration', 'rrf'], 'Combination rule');
  num('rank.weight', 0.5, 0, 1, 'Weight of the left ranking');
  num('rank.k', Math.min(100, n), 1, n, 'Selection capacity', true);
  bool('rank.previewRows', media, 'Show ranked records with media previews');
  choice('rank.view', 'lanes', ['lanes', 'sets', 'curve'], 'Ranking visualization');
  add(
    'rank.holdout',
    'rank.6',
    items.some((i) => i.split === 'holdout'),
    'Restrict evaluation to held-out rows',
  );
  choice('audit.score', score, scores, 'Scalar used to rank the audit population');
  choice(
    'audit.scope',
    defaultAuditScope(items),
    ['holdout', 'all'],
    'Held-out previews or all ranked previews',
  );
  add(
    'audit.question',
    'audit.question',
    String(
      m.provenance?.auditQuestion ??
        'Select every image containing ' +
          (m.provenance?.positiveLabel ?? 'the concept you want to study') +
          '.',
    ),
    'Question asked of reviewers',
  );
  choice(
    'audit.mode',
    'select',
    ['select', 'count'],
    'Individual selections or count-only observations',
  );
  num('audit.band', 0, 0, 4, 'Zero-based audit band', true);
  num('audit.target', 0.9, 0.5, 1, 'Target precision');
  num(
    'simulation.capacity',
    Math.min(600, n),
    1,
    n,
    'Ranked labeled population size',
    true,
    'uncertainty.capacity',
  );
  choice(
    'simulation.policy',
    'stratified',
    ['stratified', 'uniform', 'greedy'],
    'Reference sampling policy',
    'uncertainty.policy',
  );
  choice(
    'simulation.prior',
    'uniform',
    ['uniform', 'jeffreys', 'positive'],
    'Cell-rate prior',
    'uncertainty.prior',
  );
  add(
    'simulation.observedIds',
    'uncertainty.observed',
    [],
    'Observed identities in the reference experiment',
  );
  add('simulation.reveal', 'uncertainty.reveal', false, 'Reveal the known population answer');
  choice('numeric.score', score, scores, 'Quantity to sample');
  num('numeric.size', Math.min(30, n), 1, n, 'Sample size', true);
  choice('numeric.policy', 'uniform', ['uniform', 'highest'], 'Sampling policy');
  bool('numeric.reveal', false, 'Reveal the population mean');
  bool('numeric.repeating', false, 'Compute 300 repeated experiments');
  return fields;
}
export function supportsScene(scene: TourScene, m: Manifest) {
  const caps = tourCapabilities(m);
  if (scene.startsWith('queries') || scene === 'space.boundary') return caps.has('queries');
  if (scene.startsWith('network')) return caps.has('neural');
  if (scene === 'features') return caps.has('features');
  if (scene === 'audit') return caps.has('media');
  if (scene === 'simulation' || scene === 'rank.curve') return caps.has('labels');
  if (scene === 'compose.supported') return caps.has('probability');
  if (scene === 'space.compare') return caps.has('multipleRepresentations');
  return true;
}
const object = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
export function validateSceneShape(value: unknown): asserts value is SceneSpec {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !TOUR_SCENES.includes(value.scene as TourScene)
  )
    throw new Error('Scene requires schemaVersion 1 and a documented scene name.');
  const allowed = [
    'schemaVersion',
    'dataset',
    'fingerprint',
    'scene',
    'representation',
    'selectedIds',
    'pinnedIds',
    'controls',
    'seed',
    'time',
    'camera',
    'intervention',
    'auditBatches',
  ];
  for (const k of Object.keys(value))
    if (!allowed.includes(k)) throw new Error('Unknown scene field: ' + k);
  for (const k of ['dataset', 'fingerprint', 'representation'])
    if (value[k] !== undefined && (typeof value[k] !== 'string' || !value[k]))
      throw new Error(k + ' must be a nonempty string.');
  for (const k of ['selectedIds', 'pinnedIds'])
    if (
      value[k] !== undefined &&
      (!Array.isArray(value[k]) || !(value[k] as unknown[]).every((x) => typeof x === 'string'))
    )
      throw new Error(k + ' must contain item IDs.');
  if (value.controls !== undefined && !object(value.controls))
    throw new Error('controls must be an object.');
  if (
    value.seed !== undefined &&
    (!Number.isInteger(value.seed) ||
      !finite(value.seed) ||
      value.seed < 0 ||
      value.seed > 2147483647)
  )
    throw new Error('seed must be an integer between 0 and 2147483647.');
  if (value.time !== undefined && (!finite(value.time) || value.time < 0))
    throw new Error('time must be nonnegative seconds.');
  if (value.camera !== undefined) {
    if (!object(value.camera)) throw new Error('camera must be an object.');
    for (const [k, v] of Object.entries(value.camera))
      if (!['zoom', 'panX', 'panY', 'angle'].includes(k) || !finite(v))
        throw new Error('Invalid camera field: ' + k);
    const c = value.camera;
    if (c.zoom !== undefined && (Number(c.zoom) < 0.5 || Number(c.zoom) > 12))
      throw new Error('camera.zoom must be between 0.5 and 12.');
  }
}
export interface ResolvedScene {
  tool: ToolId;
  selected: number[];
  pinned: number[];
  representation: string;
  view: Record<string, unknown>;
  spec: SceneSpec;
  camera: Camera;
}
export function resolveScene(input: unknown, m: Manifest): ResolvedScene {
  validateSceneShape(input);
  const spec = structuredClone(input);
  if (!supportsScene(spec.scene, m))
    throw new Error('Dataset does not support scene ' + spec.scene);
  const schema = controlSchema(m),
    scene = sceneConfig(spec.scene, m),
    idMap = new Map(m.items.map((i, n) => [i.id, n]));
  const indices = (ids: string[]) => {
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate item IDs.');
    return ids.map((id) => {
      const n = idMap.get(id);
      if (n === undefined) throw new Error('Unknown item ID: ' + id);
      return n;
    });
  };
  const values: Record<string, Value> = {};
  for (const [name, c] of Object.entries(schema)) values[name] = c.default;
  for (const [key, value] of Object.entries(scene.view)) {
    const name = Object.keys(schema).find((n) => schema[n].key === key);
    if (name) values[name] = value as Value;
  }
  for (const [name, v] of Object.entries(spec.controls ?? {})) {
    const c = schema[name];
    if (!c) throw new Error('Unknown control: ' + name);
    const valid =
      c.type === 'strings'
        ? Array.isArray(v) && v.every((x) => typeof x === 'string')
        : c.type === 'integer'
          ? Number.isInteger(v)
          : typeof v === c.type;
    if (
      !valid ||
      (typeof v === 'number' &&
        (!Number.isFinite(v) || v < (c.min ?? -Infinity) || v > (c.max ?? Infinity)))
    )
      throw new Error('Invalid value for ' + name);
    if (
      c.options?.length &&
      (Array.isArray(v) ? v.some((x) => !c.options!.includes(x)) : !c.options.includes(v as string))
    )
      throw new Error('Unknown option for ' + name + ': ' + v);
    values[name] = v;
  }
  if (
    spec.scene.startsWith('network') &&
    spec.controls?.['network.branch'] &&
    spec.controls['network.node'] === undefined
  )
    values['network.node'] = defaultNetworkNode(m, String(values['network.branch']));
  const bank = m.queries?.find((b) => b.id === values['queries.bank']);
  if (spec.scene.startsWith('queries') || spec.scene === 'space.boundary') {
    if (!bank) throw new Error('Unknown query bank.');
    const family = String(
      values[spec.scene === 'space.boundary' ? 'space.family' : 'queries.family'],
    );
    if (!bank.items.some((q) => q.family === family))
      throw new Error('Query family is not in the selected bank.');
    if ((values['queries.disabled'] as string[]).some((id) => !bank.items.some((q) => q.id === id)))
      throw new Error('Disabled query is not in the selected bank.');
  }
  if (
    scene.tool === 'space' &&
    values['space.mode'] === 'boundary' &&
    !tourCapabilities(m).has('queries')
  )
    throw new Error('Query polarity coordinates require a query bank.');
  if (scene.tool === 'space' && values['space.compare'] && m.representations.length < 2)
    throw new Error('Comparison requires two representations.');
  if (
    scene.tool === 'rank' &&
    values['rank.view'] === 'curve' &&
    !tourCapabilities(m).has('labels')
  )
    throw new Error('Precision-recall curves require labels.');
  const rep = spec.representation ?? scene.representation ?? m.representations[0].id;
  if (!m.representations.some((r) => r.id === rep))
    throw new Error('Unknown representation: ' + rep);
  if (
    spec.scene.startsWith('space') &&
    values['space.mode'] === 'overview' &&
    !m.representations.find((r) => r.id === rep)?.overview
  )
    throw new Error('This representation has no overview projection; choose pca.');
  if (spec.scene === 'features') {
    const bank = atlasBanks(m).find((b) => b.id === values['features.bank']);
    if (!bank || Number(values['features.coordinate']) >= bank.width)
      throw new Error('Unknown feature bank or coordinate.');
    if (
      values['features.normalizer'] &&
      !findNormalizers(
        m.model,
        bank.features,
        (id) => m.representations.find((r) => r.id === id)?.dimensions,
      ).some((n) => n.id === values['features.normalizer'])
    )
      throw new Error('Saved normalization does not read this feature bank.');
  }
  if (spec.scene.startsWith('network')) {
    const node = m.model?.nodes.find((n) => n.id === values['network.node']);
    if (!node || Number(values['network.coordinate']) >= (node.weight?.length ?? 0))
      throw new Error('Unknown node or neuron coordinate.');
  }
  if (spec.scene.startsWith('compose')) {
    if (
      values['compose.method'] === 'supported' &&
      !probabilityScore(m, String(values['compose.measure']))
    )
      throw new Error('Supported counts require a probability measure.');
    const groups = new Set(
      m.items.map(
        (i) => (values['compose.groupBy'] === 'category' ? i.category : i.group) ?? 'Ungrouped',
      ),
    );
    const chosen = values['compose.chosen'] as string[];
    if (chosen.length > 2 || chosen.some((k) => !groups.has(k)))
      throw new Error('Unknown collection name.');
  }
  if (
    spec.scene.startsWith('rank') &&
    values['rank.rule'] === 'corroboration' &&
    m.items.some((i) =>
      [values['rank.left'], values['rank.right']].some((k) => (i.scores?.[String(k)] ?? 0) < 0),
    )
  )
    throw new Error('Geometric fusion requires nonnegative scores.');
  const view: Record<string, unknown> = { ...scene.view };
  for (const [name, c] of Object.entries(schema)) view[c.key] = values[name];
  view['algebra.other'] = indices([String(values['vector.otherItemId'])])[0];
  view['uncertainty.observed'] = indices(values['simulation.observedIds'] as string[]);
  if (spec.scene === 'simulation') {
    const holdout = m.items.some((i) => i.split === 'holdout'),
      measure = primaryScore(m);
    const all = ranking(
      Float64Array.from(m.items.map((i) => i.scores?.[measure] ?? NaN)),
      m.items,
    ).filter((i) => m.items[i].label !== null && (!holdout || m.items[i].split === 'holdout'));
    if (Number(values['simulation.capacity']) > all.length) {
      if (spec.controls?.['simulation.capacity'] !== undefined)
        throw new Error('Population size exceeds the labeled reference population.');
      view['uncertainty.capacity'] = all.length;
    }
    const population = new Set(all.slice(0, Number(view['uncertainty.capacity'])));
    if ((view['uncertainty.observed'] as number[]).some((i) => !population.has(i)))
      throw new Error('Observed IDs are outside the reference population.');
  }

  view['audit.expanded'] = false;
  view['audit.seed'] = spec.seed ?? 1;
  view['numeric.seed'] = spec.seed ?? 1;
  view['uncertainty.round'] = spec.seed ?? 1;
  view['uncertainty.repeats'] = [];
  view['uncertainty.distribution'] = 'posterior';
  view['compose.groupSearch'] = ['', ''];
  const selected = indices(spec.selectedIds ?? [m.items[defaultFocusIndex(m)].id]);
  const pinned = indices(spec.pinnedIds ?? []);
  if (pinned.length > 12) throw new Error('At most 12 pinned items.');
  return {
    tool: scene.tool,
    selected,
    pinned,
    representation: rep,
    view,
    spec: { ...spec, seed: spec.seed ?? 1, time: spec.time ?? 0 },
    camera: { zoom: 1, panX: 0, panY: 0, angle: 0, ...spec.camera },
  };
}
export interface Timeline {
  scene: SceneSpec;
  duration: number;
  tracks: {
    control: string;
    from: number;
    to: number;
    start?: number;
    end?: number;
    easing?: 'linear' | 'smoothstep';
  }[];
}
export function validateTimeline(t: Timeline, m: Manifest) {
  if (!t || !finite(t.duration) || t.duration <= 0 || !Array.isArray(t.tracks))
    throw new Error('Timeline needs positive duration and tracks.');
  resolveScene(t.scene, m);
  const schema = controlSchema(m),
    seen = new Set<string>();
  for (const track of t.tracks) {
    const c = schema[track.control],
      start = track.start ?? 0,
      end = track.end ?? t.duration;
    if (
      !c ||
      c.type !== 'number' ||
      seen.has(track.control) ||
      !finite(start) ||
      !finite(end) ||
      start < 0 ||
      end > t.duration ||
      end <= start ||
      !['linear', 'smoothstep'].includes(track.easing ?? 'linear')
    )
      throw new Error('Invalid or duplicate numeric timeline track: ' + track.control);
    seen.add(track.control);
    for (const v of [track.from, track.to])
      if (!finite(v) || v < (c.min ?? -Infinity) || v > (c.max ?? Infinity))
        throw new Error('Track endpoint outside control range.');
  }
}
export function timelineScene(t: Timeline, time: number): SceneSpec {
  if (!finite(time) || time < 0 || time > t.duration)
    throw new Error('Time lies outside the timeline.');
  const controls = { ...t.scene.controls };
  for (const track of t.tracks) {
    let p = Math.min(
      1,
      Math.max(0, (time - (track.start ?? 0)) / ((track.end ?? t.duration) - (track.start ?? 0))),
    );
    if (track.easing === 'smoothstep') p = p * p * (3 - 2 * p);
    controls[track.control] = track.from + (track.to - track.from) * p;
  }
  return { ...t.scene, time, controls };
}
