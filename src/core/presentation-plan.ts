import { defaultComparisonIndex, defaultFocusIndex } from './capabilities';
import type { Manifest } from './types';
// Preparation warms and queries a bounded set of examples; other previews load when opened.
export const PRESENTATION_EXAMPLES = 60;
// Matches the first examples Space Explorer lists before any selection.
export const UI_EXAMPLES = 10;
// Indices with a linked preview: the population the UI queries neighbors among.
export function previewPopulation(items: Manifest['items']): number[] {
  return items.map((item, i) => (item.media ? i : -1)).filter((i) => i >= 0);
}
// Deterministic anchors: current selections, UI defaults, then an even spread of the population.
export function presentationExamples(
  m: Manifest,
  priority: number[] = [],
  limit = PRESENTATION_EXAMPLES,
): number[] {
  const n = m.items.length,
    previews = previewPopulation(m.items),
    population = previews.length ? previews : m.items.map((_, i) => i),
    chosen = new Set<number>();
  const add = (i: number) => {
    if (chosen.size < limit && Number.isInteger(i) && i >= 0 && i < n) chosen.add(i);
  };
  if (!n) return [];
  priority.forEach(add);
  const focus = defaultFocusIndex(m);
  add(focus);
  add(defaultComparisonIndex(m, focus));
  population.slice(0, UI_EXAMPLES).forEach(add);
  const slots = limit - chosen.size;
  for (let k = 0; k < slots; k++) add(population[Math.floor((k * population.length) / slots)]);
  // Spread positions can repeat earlier picks; fill any remaining slots in dataset order.
  for (const i of population) add(i);
  return [...chosen];
}
