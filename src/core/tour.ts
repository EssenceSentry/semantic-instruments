import type { Manifest, ToolId } from './types';
import { primaryScore, probabilityScore, scoreLabel } from './capabilities';

/** Tour documents contain prose and named UI scenes, never executable code or HTML. */
export const TOUR_SCENES = [
  'space',
  'space.pca',
  'space.compare',
  'space.boundary',
  'vector',
  'vector.dot',
  'vector.distance',
  'vector.blend',
  'queries',
  'queries.top2',
  'queries.pooling',
  'features',
  'network',
  'network.flow',
  'reference',
  'compose',
  'compose.mean',
  'compose.sum',
  'compose.supported',
  'compose.profile',
  'compose.dossier',
  'rank',
  'rank.rrf',
  'rank.sets',
  'rank.curve',
  'audit',
  'simulation',
  'numeric',
] as const;
export type TourScene = (typeof TOUR_SCENES)[number];
export const TOUR_TARGETS = {
  workspace: '.instrument-body',
  dataset: '.masthead .dataset-button',
  cache: '.masthead [aria-label="Presentation cache"]',
  help: '.masthead [aria-label="Things to discover"]',
  provenance: '.masthead [aria-label="Methods and provenance"]',
  representations: '.representation-rail',
  projection: '.space-toolbar .segmented',
  cloud: '.cloud-stage',
  comparison: '[aria-label="Comparison representation"]',
  color: '[aria-label="Color points by"]',
  boundary: '[aria-label="Feature family"]',
  neighbors: '.specimen-tray',
  distance: '[aria-label="Neighbor distance"]',
  inspector: '.inspector-photo',
  workbench: '.workbench-top .segmented',
  example: '[aria-label="Workbench example"]',
  vectorSpace: '[aria-label="Algebra representation"]',
  vectorPair: '[aria-label="Second vector"]',
  vectorOperation: '[aria-label="Vector operation"]',
  vectorGeometry: '.vector-plane',
  vectorTerms: '.algebra-detail',
  blend: '[aria-label="Interpolation α"]',
  queryFamily: '[aria-label="Query family"]',
  queryModality: '[aria-label="Query modality"]',
  queries: '.query-list',
  competition: '.competition-track',
  gate: '.gate-status',
  gap: '.gap-ruler',
  temperature: '[aria-label="Temperature τ"]',
  pooling: '.operation-panel .chart',
  outputs: '.output-grid',
  prediction: '.prediction-delta',
  apply: '.operation-actions',
  featureAtlas: '[data-capture="features.atlas"] .fa-scroll',
  featureDetail: '[data-capture="features.inspector"]',
  networkFlow: '[data-capture="network.flow"] .nf-scroll',
  neuralLayer: '[aria-label="Neural layer"]',
  network: '.network-main > svg',
  contributions: '.contribution-list',
  neuron: '.neuron-result',
  perturb: '.neuron-result .slider',
  graphOutput: '.network-controls',
  referenceQuantity: '[aria-label="Reference quantity"]',
  referencePopulation: '[aria-label="Reference population"]',
  ecdf: '.calibration-workspace .chart',
  inputScore: '[aria-label="Input score"]',
  measurement: '[aria-label="Collection measurement"]',
  grouping: '[aria-label="Group observations by"]',
  reducer: '[aria-label="Aggregation rule"]',
  reducerEquation: '.reducer-equation',
  topK: '[aria-label="Top k"]',
  added: '[aria-label="Added observations"]',
  confidence: '[aria-label="Confidence"]',
  collection: '.collection:first-child .collection-top',
  inventory: '.collection:first-child .inventory-grid',
  profile: '.collection:first-child .chart',
  evidencePolicy: '[aria-label="Evidence policy 0"]',
  evidenceSlots: '[aria-label="Evidence slots 0"]',
  evidence: '.collection:first-child .dossier-tray',
  leftScore: '[aria-label="Left ranking score"]',
  rightScore: '[aria-label="Right ranking score"]',
  fusion: '[aria-label="Rank fusion rule"]',
  weight: '[aria-label="Left weight α"]',
  capacity: '[aria-label="Review capacity k"]',
  holdout: '.ranking-layout .experiment-controls .check-label',
  lanes: '.ranking-lanes',
  rankSummary: '.ranking-summary',
  sets: '.selection-sets',
  curves: '.ranking-curves',
  saveRanking: '.ranking-layout .experiment-controls > button.secondary',
  uncertainty: '.uncertainty-workspace > .composition-toolbar',
  auditScore: '[aria-label="Audit ranking score"]',
  auditBands: '.audit-bands',
  auditPrompt: '.audit-prompt',
  auditMode: '[aria-label="Audit input mode"]',
  auditGrid: '[aria-label="Audit image grid"]',
  auditExpand: '.audit-task-tools',
  auditSubmit: '.audit-submit, .audit-complete',
  auditQuestion: '.audit-question',
  auditMath: '.audit-math',
  auditCurve: '.audit-curve',
  auditCutoff: '.audit-cutoff',
  auditTarget: '[aria-label="Precision target"]',
  auditExport: '[data-tour="audit-export"]',
  populationSize: '[aria-label="Ranked population size"]',
  samplingPolicy: '[aria-label="Sampling policy"]',
  prior: '[aria-label="Cell-rate prior"]',
  sample: '.sample-actions',
  population: '.population-card',
  distribution: '.distribution-card',
  reveal: '.uncertainty-layout .reveal-button',
  repeat: '[data-tour="repeat-reference"]',
  numericQuantity: '[aria-label="Sample quantity"]',
  sampleSize: '[aria-label="Sample size"]',
  numericPolicy: '[aria-label="Numeric sampling policy"]',
  numericSummary: '.numeric-main .uncertainty-summary',
  numericRepeat: '.numeric-layout .experiment-controls > button.secondary',
  numericDistribution: '.numeric-distribution',
} as const;
export type TourTarget = keyof typeof TOUR_TARGETS;
export const TOUR_CAPABILITIES = [
  'queries',
  'multiQuery',
  'neural',
  'features',
  'probability',
  'media',
  'labels',
  'holdout',
  'overview',
  'multipleRepresentations',
] as const;
export type TourCapability = (typeof TOUR_CAPABILITIES)[number];
export interface TourStep {
  id: string;
  chapter: string;
  scene: TourScene;
  target?: TourTarget;
  title: string;
  body: string[];
  formula?: string;
  detail?: { title: string; body: string[]; formula?: string };
  try?: string;
  requires?: TourCapability[];
}
export interface TourChapter {
  id: string;
  title: string;
  description: string;
}
export interface TourDocument {
  schemaVersion: 1;
  id: string;
  version: number;
  title: string;
  description: string;
  datasetIds?: string[];
  extends?: 'default';
  chapters?: TourChapter[];
  steps?: TourStep[];
  overrides?: Record<
    string,
    Partial<Pick<TourStep, 'title' | 'body' | 'formula' | 'detail' | 'try'>>
  >;
  additions?: (TourStep & { after: string })[];
}
export interface ResolvedTour extends TourDocument {
  chapters: TourChapter[];
  steps: TourStep[];
}
const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);
const record = (x: unknown): x is Record<string, unknown> =>
  !!x && typeof x === 'object' && !Array.isArray(x);
const text = (x: unknown, max = 6000): x is string =>
  typeof x === 'string' && x.length > 0 && x.length <= max;
const id = (x: unknown): x is string => text(x, 80) && /^[a-z0-9][a-z0-9._-]*$/.test(x);
const prose = (x: unknown) =>
  Array.isArray(x) && x.length > 0 && x.length <= 12 && x.every((v) => text(v));
function contentValid(s: Record<string, unknown>, partial = false) {
  return (
    (partial || (text(s.title, 180) && prose(s.body))) &&
    (s.title === undefined || text(s.title, 180)) &&
    (s.body === undefined || prose(s.body)) &&
    (s.try === undefined || text(s.try)) &&
    (s.formula === undefined || text(s.formula, 2000)) &&
    (s.detail === undefined ||
      (record(s.detail) &&
        text(s.detail.title, 180) &&
        prose(s.detail.body) &&
        (s.detail.formula === undefined || text(s.detail.formula, 2000))))
  );
}
export function parseTour(value: unknown): TourDocument {
  if (
    !record(value) ||
    value.schemaVersion !== 1 ||
    !id(value.id) ||
    !Number.isInteger(value.version) ||
    (value.version as number) < 1 ||
    !text(value.title, 180) ||
    !text(value.description)
  )
    throw new Error(
      'A tour needs schemaVersion 1, an id, a positive version, a title and a description.',
    );
  if (value.extends !== undefined && value.extends !== 'default')
    throw new Error('Tours can extend only the bundled default tour.');
  if (
    value.datasetIds !== undefined &&
    (!Array.isArray(value.datasetIds) || !value.datasetIds.every((v) => text(v, 200)))
  )
    throw new Error('datasetIds must contain dataset IDs.');
  if (
    value.chapters !== undefined &&
    (!Array.isArray(value.chapters) ||
      value.chapters.length > 60 ||
      !value.chapters.every(
        (c) => record(c) && id(c.id) && text(c.title, 180) && text(c.description),
      ))
  )
    throw new Error('Invalid tour chapters.');
  const validStep = (s: unknown) =>
    record(s) &&
    id(s.id) &&
    id(s.chapter) &&
    TOUR_SCENES.includes(s.scene as TourScene) &&
    (s.target === undefined || (typeof s.target === 'string' && own(TOUR_TARGETS, s.target))) &&
    contentValid(s) &&
    (s.requires === undefined ||
      (Array.isArray(s.requires) &&
        s.requires.every((c) => TOUR_CAPABILITIES.includes(c as TourCapability))));
  if (
    value.steps !== undefined &&
    (!Array.isArray(value.steps) || value.steps.length > 300 || !value.steps.every(validStep))
  )
    throw new Error('Invalid tour step: use documented scenes, targets and capabilities.');
  if (
    value.additions !== undefined &&
    (!Array.isArray(value.additions) ||
      value.additions.length > 100 ||
      !value.additions.every((s) => validStep(s) && record(s) && id(s.after)))
  )
    throw new Error('Invalid additional tour step.');
  if (
    value.overrides !== undefined &&
    (!record(value.overrides) ||
      Object.entries(value.overrides).some(
        ([k, v]) =>
          !id(k) ||
          !record(v) ||
          !contentValid(v, true) ||
          Object.keys(v).some((k) => !['title', 'body', 'formula', 'detail', 'try'].includes(k)),
      ))
  )
    throw new Error('Overrides may change narration, formulas and optional exercises only.');
  return value as unknown as TourDocument;
}
export function resolveTour(document: TourDocument, base?: TourDocument): ResolvedTour {
  const inherited = document.extends ? base : undefined;
  if (document.extends && !inherited)
    throw new Error('The default tour is required for this specialized tour.');
  const chapters = document.chapters ?? inherited?.chapters ?? [];
  const steps = (document.steps ?? inherited?.steps ?? []).map((s) => ({
    ...s,
    ...document.overrides?.[s.id],
  }));
  for (const key of Object.keys(document.overrides ?? {}))
    if (!steps.some((s) => s.id === key)) throw new Error('Unknown overridden step: ' + key);
  for (const added of document.additions ?? []) {
    const at = steps.findIndex((s) => s.id === added.after);
    if (at < 0) throw new Error('Unknown insertion point: ' + added.after);
    const { after: _after, ...step } = added;
    steps.splice(at + 1, 0, step);
  }
  if (
    !steps.length ||
    !chapters.length ||
    steps.length > 300 ||
    new Set(steps.map((s) => s.id)).size !== steps.length ||
    new Set(chapters.map((c) => c.id)).size !== chapters.length ||
    steps.some((s) => !chapters.some((c) => c.id === s.chapter))
  )
    throw new Error('Tour steps and chapters need unique IDs and valid chapter references.');
  const { extends: _extends, overrides: _overrides, additions: _additions, ...metadata } = document;
  return { ...metadata, chapters, steps };
}
export function tourCapabilities(m: Manifest): Set<TourCapability> {
  const result = new Set<TourCapability>();
  const score = primaryScore(m);
  if (m.queries?.some((q) => m.featureDefinitions?.[q.id]?.length)) result.add('queries');
  if ((m.queries?.length ?? 0) > 1) result.add('multiQuery');
  if (m.representations.some(r => r.kind === 'features')) result.add('features');
  if (m.model?.nodes.some((n) => n.op === 'dense')) result.add('neural');
  if (probabilityScore(m)) result.add('probability');
  if (m.items.some((i) => i.media && Number.isFinite(i.scores?.[score]))) result.add('media');
  if (m.items.some((i) => i.label != null)) result.add('labels');
  if (m.items.some((i) => i.split === 'holdout')) result.add('holdout');
  if (m.representations.some((r) => r.overview)) result.add('overview');
  if (m.representations.length > 1) result.add('multipleRepresentations');
  return result;
}
export function availableTour(tour: ResolvedTour, m: Manifest, instrument?: ToolId): ResolvedTour {
  const caps = tourCapabilities(m);
  const supportsScene = (scene: TourScene) => {
    if (scene.startsWith('queries') || scene === 'space.boundary') return caps.has('queries');
    if (scene.startsWith('network')) return caps.has('neural');
    if (scene === 'features') return caps.has('features');
    if (scene === 'audit') return caps.has('media');
    if (scene === 'simulation' || scene === 'rank.curve') return caps.has('labels');
    if (scene === 'compose.supported') return caps.has('probability');
    if (scene === 'space.compare') return caps.has('multipleRepresentations');
    return true;
  };
  const steps = tour.steps.filter(
    (s) =>
      supportsScene(s.scene) &&
      (s.requires ?? []).every((c) => caps.has(c)) &&
      (!instrument || sceneConfig(s.scene, m).tool === instrument),
  );
  return {
    ...tour,
    steps,
    chapters: tour.chapters.filter((c) => steps.some((s) => s.chapter === c.id)),
  };
}
export function tourFacts(m: Manifest): Record<string, string> {
  const num = (n: number) => n.toLocaleString('en-US');
  return {
    title: m.title,
    records: num(m.items.length),
    previews: num(m.items.filter((i) => i.media).length),
    holdout: num(m.items.filter((i) => i.split === 'holdout').length),
    fit: num(m.items.filter((i) => i.split === 'fit').length),
    representations: num(m.representations.length),
    firstDimensions: num(m.representations[0].dimensions),
    queryCount: num(m.queries?.[0]?.items.length ?? 0),
    featureCount: num(m.featureDefinitions?.[m.queries?.[0]?.id ?? '']?.length ?? 0),
    queryFamilies: num(new Set(m.queries?.[0]?.items.map((q) => q.family)).size),
    primaryScore: scoreLabel(m),
    modelDescription: m.model?.description ?? 'Operators are evaluated in their declared order.',
    groupScope:
      m.presets?.groupBy === 'category'
        ? 'The loaded records in each supplied category.'
        : String(m.provenance?.groupScope ?? 'Only the observations supplied in this dataset.'),
    positiveLabel: String(m.provenance?.positiveLabel ?? 'Positive'),
  };
}
export function interpolateTour(value: string, facts: Record<string, string>) {
  return value.replace(/\{\{([a-zA-Z]+)\}\}/g, (_, key: string) => facts[key] ?? '{{' + key + '}}');
}
export interface TourSceneConfig {
  tool: ToolId;
  view: Record<string, unknown>;
  representation?: string;
}
/** Scenes only navigate. They never train, apply an intervention, submit labels or load data. */
export function sceneConfig(scene: TourScene, m: Manifest): TourSceneConfig {
  if (scene.startsWith('space')) {
    const first = m.representations[0];
    return {
      tool: 'space',
      representation: first.id,
      view: {
        'space.mode':
          scene === 'space.boundary'
            ? 'boundary'
            : scene === 'space.pca' || scene === 'space.compare'
              ? 'pca'
              : first.overview
                ? 'overview'
                : 'pca',
        'space.compare': scene === 'space.compare',
        'space.rotate': false,
        ...(scene === 'space.compare'
          ? { 'space.other': m.representations[Math.min(2, m.representations.length - 1)].id }
          : {}),
      },
    };
  }
  if (scene.startsWith('vector'))
    return {
      tool: 'transform',
      view: {
        'transform.0': 'algebra',
        'algebra.operation':
          scene === 'vector.dot'
            ? 'dot'
            : scene === 'vector.distance'
              ? 'distance'
              : scene === 'vector.blend'
                ? 'blend'
                : 'cosine',
      },
    };
  if (scene.startsWith('queries'))
    return {
      tool: 'transform',
      view: {
        'transform.0': 'queries',
        'transform.operator':
          scene === 'queries.top2' ? 'top2' : scene === 'queries.pooling' ? 'lse' : 'boundary',
      },
    };
  if (scene === 'features') return { tool: 'transform', view: { 'transform.0': 'features' } };
  if (scene.startsWith('network')) return { tool: 'transform', view: { 'transform.0': 'network', 'network.view': scene === 'network.flow' ? 'flow' : 'arithmetic' } };
  if (scene === 'reference') return { tool: 'transform', view: { 'transform.0': 'calibration' } };
  if (scene.startsWith('compose'))
    return {
      tool: 'compose',
      view: {
        ...(scene === 'compose.supported' ? { 'compose.measure': primaryScore(m) } : {}),
        'compose.view':
          scene === 'compose.profile'
            ? 'profile'
            : scene === 'compose.dossier'
              ? 'dossier'
              : 'inventory',
        'compose.method':
          scene === 'compose.mean'
            ? 'mean'
            : scene === 'compose.sum'
              ? 'sum'
              : scene === 'compose.supported'
                ? 'supported'
                : 'topk',
      },
    };
  if (scene.startsWith('rank'))
    return {
      tool: 'rank',
      view: {
        'rank.view': scene === 'rank.sets' ? 'sets' : scene === 'rank.curve' ? 'curve' : 'lanes',
        'rank.rule': scene === 'rank.rrf' ? 'rrf' : 'weighted',
      },
    };
  return {
    tool: 'uncertainty',
    view: {
      'uncertainty.mode':
        scene === 'audit' ? 'mini' : scene === 'simulation' ? 'reference' : 'numeric',
    },
  };
}
export interface TourProgress {
  stepId: string;
  completed: boolean;
  updatedAt: string;
}
export function tourProgressKey(tour: TourDocument, datasetId: string) {
  return `semantic-tour:${datasetId}:${tour.id}:v${tour.version}`;
}
export function readTourProgress(tour: ResolvedTour, datasetId: string): TourProgress | null {
  try {
    const saved = JSON.parse(localStorage.getItem(tourProgressKey(tour, datasetId)) ?? 'null');
    return saved &&
      typeof saved.completed === 'boolean' &&
      tour.steps.some((s) => s.id === saved.stepId)
      ? saved
      : null;
  } catch {
    return null;
  }
}
