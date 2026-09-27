import { useSyncExternalStore } from 'react';
export interface Activity {
  id: number;
  label: string;
  started: number;
  fraction?: number;
}
const listeners = new Set<() => void>();
const jobs = new Map<number, Activity>();
let snapshot: Activity[] = [];
const emit = () => {
  snapshot = [...jobs.values()];
  listeners.forEach((f) => f());
};
export function beginActivity(id: number, label: string) {
  jobs.set(id, { id, label, started: performance.now() });
  emit();
}
export function progressActivity(id: number, label: string, fraction?: number) {
  const job = jobs.get(id);
  if (job) {
    jobs.set(id, { ...job, label, fraction });
    emit();
  }
}
export function endActivity(id: number) {
  jobs.delete(id);
  emit();
}
export const useActivity = () =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    () => snapshot,
  );

export const currentActivities = () => snapshot;
