import { resolveScene, type SceneSpec } from './scene-schema';
import type { Manifest } from './types';
import type { ResolvedTour, TourSceneState, TourStep } from './tour';

/** The complete Scene API scene a staged step opens, or null for a navigation-only step. */
export function tourStepScene(step: TourStep): SceneSpec | null {
  if (!step.state) return null;
  return structuredClone({ schemaVersion: 1, scene: step.scene, ...step.state });
}

function patchScene(
  current: SceneSpec,
  scene: SceneSpec['scene'] | undefined,
  state: TourSceneState = {},
) {
  const next: SceneSpec = { ...structuredClone(current), ...structuredClone(state) };
  if (scene) next.scene = scene;
  if (current.controls || state.controls)
    next.controls = {
      ...structuredClone(current.controls ?? {}),
      ...structuredClone(state.controls ?? {}),
    };
  if (current.camera || state.camera) next.camera = { ...current.camera, ...state.camera };
  return next;
}

/**
 * The scene an action leads to. Patches apply to the scene on screen, so actions can build on
 * each other (raise the confidence, then add items); "restore" returns to the step's own scene.
 */
export function tourActionScene(step: TourStep, action: number, current: SceneSpec): SceneSpec {
  const a = step.actions?.[action];
  if (!a) throw new Error(`Step ${step.id} has no action ${action}.`);
  if (a.restore) {
    const opening = tourStepScene(step);
    if (!opening) throw new Error(`Step ${step.id} has no scene to restore.`);
    return opening;
  }
  return patchScene(current, a.scene, a.state);
}

/** Every staged step and action, resolved against the dataset, as author-facing messages. */
export function checkTourScenes(tour: ResolvedTour, m: Manifest): string[] {
  const problems: string[] = [];
  for (const step of tour.steps) {
    const opening = tourStepScene(step) ?? { schemaVersion: 1 as const, scene: step.scene };
    if (step.state)
      try {
        resolveScene(opening, m);
      } catch (error) {
        problems.push(`Step ${step.id}: ${(error as Error).message}`);
        continue;
      }
    for (const [i, a] of (step.actions ?? []).entries()) {
      try {
        resolveScene(tourActionScene(step, i, opening), m);
      } catch (error) {
        problems.push(`Step ${step.id}, action “${a.label}”: ${(error as Error).message}`);
      }
    }
  }
  return problems;
}

const MIN_READING = 8,
  MAX_READING = 30;
/**
 * When to press each action and when to move on. Steps without a schedule stay on screen for
 * their reading time. `pace` stretches or compresses the whole schedule.
 */
export function autoplayPlan(step: TourStep, pace = 1) {
  const scale = Number.isFinite(pace) && pace > 0 ? pace : 1;
  if (step.autoplay)
    return {
      dwell: step.autoplay.dwell * scale,
      actions: (step.autoplay.actions ?? []).map((a) => ({ at: a.at * scale, action: a.action })),
    };
  const words = [step.title, ...step.body, step.try ?? '']
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length;
  // About 150 words a minute, plus a moment to look at the view.
  const reading = Math.min(MAX_READING, Math.max(MIN_READING, words / 2.5 + 3));
  return { dwell: reading * scale, actions: [] as { at: number; action: number }[] };
}

/** The tour named by `?tour=`, resolved against the app. Only the lab's own origin is allowed. */
export function tourUrlFromSearch(search: string, base: string): string | null {
  const value = new URLSearchParams(search).get('tour');
  if (!value) return null;
  const app = new URL(base);
  let url: URL;
  try {
    url = new URL(value, app);
  } catch {
    throw new Error('Tour links must name a JSON file on the same site as the lab.');
  }
  if (url.origin !== app.origin || !/^https?:$/.test(url.protocol))
    throw new Error('Tour links must name a JSON file on the same site as the lab.');
  return url.href;
}
