/** Shared reactive view state, used equally by the UI, tours and scene API. */
export class ViewState extends Map<string, unknown> {
  private listeners = new Set<() => void>();
  private depth = 0;
  private changed = false;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit() {
    if (this.depth) {
      this.changed = true;
      return;
    }
    this.listeners.forEach((listener) => listener());
  }
  override set(key: string, value: unknown) {
    if (!this.has(key) || !Object.is(this.get(key), value)) {
      super.set(key, value);
      this.emit();
    }
    return this;
  }
  override delete(key: string) {
    const deleted = super.delete(key);
    if (deleted) this.emit();
    return deleted;
  }
  override clear() {
    if (this.size) {
      super.clear();
      this.emit();
    }
  }
  batch(fn: () => void) {
    this.depth++;
    try {
      fn();
    } finally {
      if (--this.depth === 0 && this.changed) {
        this.changed = false;
        this.emit();
      }
    }
  }
  replace(values: Record<string, unknown>) {
    this.batch(() => {
      this.clear();
      Object.entries(values).forEach(([k, v]) => this.set(k, v));
    });
  }
}
