import { ViewState } from './view-state';
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Dataset, Intervention, Matrix, ToolId } from './types';
export interface LabContext {
  dataset: Dataset;
  selected: number[];
  setSelected: (x: number[]) => void;
  pinned: number[];
  pin: (i: number) => void;
  tool: ToolId;
  setTool: (s: ToolId) => void;
  representation: string;
  setRepresentation: (s: string) => void;
  positions: Map<string, Matrix>;
  intervened: Map<string, Matrix>;
  intervention: Intervention;
  applyIntervention: (x: Intervention) => Promise<void>;
  busy: boolean;
  status: string;
  load: (url: string) => Promise<void>;
  annotateItems: (labels: { id: string; label: number }[], question?: string) => void;
  keepScore: (values: ArrayLike<number>, description: string) => void;
  viewState: ViewState;
}
export const Context = createContext<LabContext | null>(null);
export function useLab() {
  const c = useContext(Context);
  if (!c) throw new Error('Missing laboratory context');
  return c;
}

/** Preserve an instrument's controls when another instrument is opened. */
export function useToolState<T>(
  key: string,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>] {
  const cache = useLab().viewState;
  const [fallback] = useState<T>(() =>
    typeof initial === 'function' ? (initial as () => T)() : initial,
  );
  const value = useSyncExternalStore(cache.subscribe, () =>
    cache.has(key) ? (cache.get(key) as T) : fallback,
  );
  useEffect(() => {
    if (!cache.has(key)) cache.set(key, fallback);
  }, [cache, key, fallback]);
  const update: Dispatch<SetStateAction<T>> = (action) => {
    const previous = cache.has(key) ? (cache.get(key) as T) : fallback;
    cache.set(key, typeof action === 'function' ? (action as (value: T) => T)(previous) : action);
  };
  return [value, update];
}
