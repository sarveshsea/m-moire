// FIFO queue per command method with dedupe (#28). A rapid-fire click on
// "sync" used to fan out N concurrent identical commands; now the second
// and subsequent invocations within a dedupe window attach to the original
// in-flight request instead of racing against it.
//
// This is a client-side queue — the main thread still receives at most one
// in-flight dispatch per method. When the result lands, every attached
// waiter resolves against the same payload.

export interface QueuedRequest<TResult = unknown> {
  method: string;
  dedupeKey: string;
  resolve: (value: TResult) => void;
  reject: (err: unknown) => void;
  enqueuedAt: number;
}

export interface CommandQueue<TResult = unknown> {
  enqueue(method: string, dedupeKey: string): {
    isNew: boolean;
    promise: Promise<TResult>;
  };
  resolve(method: string, dedupeKey: string, value: TResult): number;
  reject(method: string, dedupeKey: string, err: unknown): number;
  // Drops every waiter for the given method (e.g. on bridge disconnect).
  failMethod(method: string, err: unknown): number;
  // Drops every waiter in the queue. Returns how many were dropped.
  clear(err?: unknown): number;
  size(): number;
  pending(): ReadonlyArray<QueuedRequest<TResult>>;
}

interface InternalWaiter<TResult> {
  resolve: (value: TResult) => void;
  reject: (err: unknown) => void;
  enqueuedAt: number;
}

export function createCommandQueue<TResult = unknown>(options: {
  now?: () => number;
} = {}): CommandQueue<TResult> {
  const now = options.now ?? (() => Date.now());
  // method -> dedupeKey -> list of waiters. The first waiter for a key is
  // the "leader" and its request is what actually went to the main thread.
  const byMethod = new Map<string, Map<string, InternalWaiter<TResult>[]>>();

  function keyMap(method: string): Map<string, InternalWaiter<TResult>[]> {
    let keys = byMethod.get(method);
    if (!keys) {
      keys = new Map();
      byMethod.set(method, keys);
    }
    return keys;
  }

  function takeWaiters(method: string, dedupeKey: string): InternalWaiter<TResult>[] {
    const keys = byMethod.get(method);
    if (!keys) return [];
    const waiters = keys.get(dedupeKey) ?? [];
    keys.delete(dedupeKey);
    if (keys.size === 0) byMethod.delete(method);
    return waiters;
  }

  return {
    enqueue(method, dedupeKey) {
      const keys = keyMap(method);
      const existing = keys.get(dedupeKey);
      const promise = new Promise<TResult>((resolve, reject) => {
        const waiter: InternalWaiter<TResult> = {
          resolve,
          reject,
          enqueuedAt: now(),
        };
        if (existing) {
          existing.push(waiter);
        } else {
          keys.set(dedupeKey, [waiter]);
        }
      });
      return { isNew: !existing, promise };
    },

    resolve(method, dedupeKey, value) {
      const waiters = takeWaiters(method, dedupeKey);
      for (const w of waiters) w.resolve(value);
      return waiters.length;
    },

    reject(method, dedupeKey, err) {
      const waiters = takeWaiters(method, dedupeKey);
      for (const w of waiters) w.reject(err);
      return waiters.length;
    },

    failMethod(method, err) {
      const keys = byMethod.get(method);
      if (!keys) return 0;
      let count = 0;
      for (const waiters of keys.values()) {
        for (const w of waiters) {
          w.reject(err);
          count += 1;
        }
      }
      byMethod.delete(method);
      return count;
    },

    clear(err) {
      let count = 0;
      for (const keys of byMethod.values()) {
        for (const waiters of keys.values()) {
          for (const w of waiters) {
            if (err !== undefined) w.reject(err);
            else w.resolve(undefined as unknown as TResult);
            count += 1;
          }
        }
      }
      byMethod.clear();
      return count;
    },

    size() {
      let count = 0;
      for (const keys of byMethod.values()) {
        for (const waiters of keys.values()) count += waiters.length;
      }
      return count;
    },

    pending() {
      const out: QueuedRequest<TResult>[] = [];
      for (const [method, keys] of byMethod) {
        for (const [dedupeKey, waiters] of keys) {
          for (const w of waiters) {
            out.push({
              method,
              dedupeKey,
              resolve: w.resolve,
              reject: w.reject,
              enqueuedAt: w.enqueuedAt,
            });
          }
        }
      }
      return out;
    },
  };
}
