export const COMPONENTS = {
  workspace: 'Whole instrument workspace',
  'space.scatter': 'Linked embedding or representation scatter plots',
  'space.primary': 'Primary scatter plot with axes and caption',
  'space.comparison': 'Comparison scatter plot',
  'space.neighbors': 'High-dimensional neighbor previews',
  'space.inspector': 'Selected record and its measurements',
  'vector.geometry': 'Vector geometry diagram',
  'vector.metrics': 'Dot product, length and angle measurements',
  'vector.detail': 'Coordinate arithmetic and interpolation',
  'queries.input': 'Selected example and query similarities',
  'queries.list': 'Query similarity values',
  'queries.operation': 'Query competition, top-two gap or pooling calculation',
  'queries.output': 'Computed features and prediction',
  'queries.competition': 'Positive versus negative maximum similarity',
  'queries.features': 'Feature values',
  'queries.prediction': 'Resulting prediction comparison',
  'transform.example': 'Shared example identity and graph prediction',
  'features.atlas': 'Feature matrix by family and operator',
  'features.inspector': 'Selected feature formula, normalization and intervention difference',
  'network.flow': 'Graph topology with weighted activation flow',
  'network.members': 'Actual graph ensemble member outputs',
  'network.diagram': 'Neural connections and actual activations',
  'network.calculation': 'Network diagram and neuron calculation',
  'network.contributions': 'Weighted input contributions',
  'network.neuron': 'Preactivation and activation calculation',
  'reference.ecdf': 'Empirical reference distribution',
  'compose.equation': 'Collection reduction equation',
  'compose.collections': 'Both collections and summaries',
  'compose.collectionA': 'First collection',
  'compose.collectionB': 'Second collection',
  'rank.lanes': 'Three linked rankings',
  'rank.sets': 'Shared and exclusive selected sets',
  'rank.curves': 'Precision and recall curves',
  'audit.task': 'Mini-audit image-selection task',
  'audit.grid': 'Nine-image audit grid',
  'audit.math': 'Observed counts and posterior mathematics',
  'audit.curve': 'Posterior precision curve and uncertainty ribbon',
  'simulation.population': 'Ranked reference population',
  'simulation.distribution': 'Reference experiment posterior',
  'numeric.summary': 'Sample estimate and uncertainty interval',
  'numeric.distribution': 'Sample values or repeated sample means',
} as const;
export type ComponentId = keyof typeof COMPONENTS;
export const selectorFor = (id: string) => {
  if (!Object.hasOwn(COMPONENTS, id)) throw new Error('Unknown component: ' + id);
  return `[data-capture="${id}"]`;
};
export function componentElement(id: string): HTMLElement | SVGElement {
  const elements = document.querySelectorAll<HTMLElement | SVGElement>(selectorFor(id));
  if (elements.length !== 1)
    throw new Error(`Component ${id} must be mounted exactly once (found ${elements.length}).`);
  return elements[0];
}
export function componentManifest() {
  return Object.entries(COMPONENTS).map(([id, title]) => {
    const els = document.querySelectorAll<HTMLElement | SVGElement>(selectorFor(id)),
      el = els[0],
      r = el?.getBoundingClientRect();
    const rendered =
      !!el && !!r?.width && !!r?.height && getComputedStyle(el).visibility !== 'hidden';
    return {
      id,
      title,
      selector: selectorFor(id),
      mounted: els.length === 1,
      visible: rendered,
      renderer:
        el?.tagName.toLowerCase() === 'svg'
          ? 'svg'
          : el?.querySelector('canvas')
            ? 'webgl'
            : el?.querySelector('svg')
              ? 'mixed'
              : 'html',
      bounds: r ? { x: r.x, y: r.y, width: r.width, height: r.height } : null,
      scrollSize: el ? { width: el.scrollWidth, height: el.scrollHeight } : null,
    };
  });
}
export interface CaptureOptions {
  component?: ComponentId;
  background?: 'white' | 'transparent' | 'theme';
}
let capture: CaptureOptions | null = null;
let themeBeforeCapture: string | null = null;
export const captureState = () => capture;
export function clearCapture() {
  document
    .querySelectorAll('.capture-target,.capture-ancestor')
    .forEach((e) => e.classList.remove('capture-target', 'capture-ancestor'));
  document.documentElement.classList.remove('scene-capture', 'scene-transparent');
  capture = null;
  if (themeBeforeCapture !== null) {document.documentElement.dataset.theme = themeBeforeCapture; themeBeforeCapture = null;}
}
export function layoutCapture(options: CaptureOptions) {
  if (options.background !== undefined && !['white', 'transparent', 'theme'].includes(options.background))
    throw new Error('Capture background must be white, transparent or theme.');
  const target = componentElement(options.component ?? 'workspace');
  clearCapture();
  capture = {
    component: options.component ?? 'workspace',
    background: options.background ?? 'white',
  };
  if (capture.background === 'white') {
    themeBeforeCapture = document.documentElement.dataset.theme ?? 'light';
    document.documentElement.dataset.theme = 'light';
  }
  document.documentElement.classList.add('scene-capture');
  if (capture.background === 'transparent')
    document.documentElement.classList.add('scene-transparent');
  target.classList.add('capture-target');
  let ancestor = target.parentElement;
  while (ancestor && ancestor !== document.body) {
    ancestor.classList.add('capture-ancestor');
    ancestor = ancestor.parentElement;
  }
  target.querySelectorAll('*').forEach((el) => {
    if (el instanceof HTMLElement) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  });
}
