/** Lazy, per-process single-flight cache: no background polling or paid monitoring. */
export class CachedReadiness {
  private cached: { ready: boolean; expires: number } | undefined;
  private flight: Promise<boolean> | undefined;
  private active = false;
  private closed = false;
  private finish: ((ready: boolean) => void) | undefined;
  constructor(private readonly probe: () => Promise<void>, private readonly now = Date.now,
    private readonly ttlMs = 60_000, private readonly timeoutMs = 3_000) {}

  check(): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    if (this.cached && this.cached.expires > this.now()) return Promise.resolve(this.cached.ready);
    if (this.active) return this.flight ?? Promise.resolve(false);
    this.active = true;
    let complete!: (value: boolean) => void;
    const result = new Promise<boolean>(resolve => { complete = resolve; });
    this.flight = result;
    let settled = false;
    const timer = setTimeout(() => finish(false), this.timeoutMs);
    const finish = (ready: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      this.finish = undefined;
      if (!this.closed) this.cached = { ready, expires: this.now() + this.ttlMs };
      complete(ready && !this.closed);
    };
    this.finish = finish;
    // A timed-out underlying probe retains the gate until it settles: repeated
    // requests cannot accumulate hung SDK calls after the cache expires.
    Promise.resolve().then(() => { if (this.closed) throw new Error('closed'); return this.probe(); }).then(() => finish(true), () => finish(false)).finally(() => {
      this.active = false;
      this.flight = undefined;
    });
    return result;
  }
  close(): void {
    this.closed = true;
    this.cached = undefined;
    this.finish?.(false);
  }
}
