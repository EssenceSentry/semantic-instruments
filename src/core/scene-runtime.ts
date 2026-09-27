import type { Camera } from './scene-schema';
export interface FrameState {
  fixed: boolean;
  time: number;
  seed: number;
  camera: Camera;
  revision: number;
}
let frame: FrameState = {
  fixed: false,
  time: 0,
  seed: 1,
  camera: { zoom: 1, panX: 0, panY: 0, angle: 0 },
  revision: 0,
};
export const frameState = () => frame;
export function setFrame(patch: Partial<FrameState>) {
  frame = { ...frame, ...patch, revision: frame.revision + 1 };
}
export const renderers = new Set<() => boolean>();
export function registerRenderer(ready: () => boolean) {
  renderers.add(ready);
  return () => {
    renderers.delete(ready);
  };
}
export const sceneActions = new Map<string, Record<string, (...args: any[]) => any>>();
export function registerSceneActions(
  name: string,
  actions: Record<string, (...args: any[]) => any>,
) {
  sceneActions.set(name, actions);
  return () => {
    if (sceneActions.get(name) === actions) sceneActions.delete(name);
  };
}
