// Fixed-capacity ring buffer for documentchange events.
//
// Replaces the previous `.slice(-max)` pattern in main/index.ts which silently
// discarded the oldest entries on overflow (#18). This buffer is still bounded
// but emits a drop event every time one or more entries are evicted, so the UI
// and downstream bridge consumers can render an explicit data-loss signal
// instead of silently drifting.

export interface ChangeBufferEntry {
  type: string;
  id: string;
  origin: string | null;
  sessionId: string;
  runId: string | null;
  pageId: string | null;
  timestamp: number;
}

export interface ChangeBufferDropEvent {
  droppedCount: number;
  // Oldest-entry timestamps that were evicted. Useful for "you missed events
  // between X and Y" UI copy.
  firstDroppedAt: number;
  lastDroppedAt: number;
  remaining: number;
  capacity: number;
}

export interface ChangeBufferOptions {
  capacity: number;
  onDrop?: (event: ChangeBufferDropEvent) => void;
}

export interface ChangeBuffer {
  push(entry: ChangeBufferEntry): void;
  pushMany(entries: ReadonlyArray<ChangeBufferEntry>): void;
  // Drains and returns all entries, clearing the buffer.
  drain(): ChangeBufferEntry[];
  // Returns a snapshot of current entries without clearing.
  peek(): ReadonlyArray<ChangeBufferEntry>;
  size(): number;
  capacity(): number;
  clear(): void;
}

export function createChangeBuffer(options: ChangeBufferOptions): ChangeBuffer {
  if (!Number.isInteger(options.capacity) || options.capacity <= 0) {
    throw new Error(`ChangeBuffer capacity must be a positive integer, got ${options.capacity}`);
  }
  const cap = options.capacity;
  const onDrop = options.onDrop;
  let entries: ChangeBufferEntry[] = [];

  function evict(needed: number): void {
    if (needed <= 0) return;
    const dropped = entries.slice(0, needed);
    entries = entries.slice(needed);
    if (onDrop && dropped.length > 0) {
      onDrop({
        droppedCount: dropped.length,
        firstDroppedAt: dropped[0].timestamp,
        lastDroppedAt: dropped[dropped.length - 1].timestamp,
        remaining: entries.length,
        capacity: cap,
      });
    }
  }

  return {
    push(entry) {
      entries.push(entry);
      if (entries.length > cap) evict(entries.length - cap);
    },
    pushMany(incoming) {
      if (incoming.length === 0) return;
      // If a single batch exceeds capacity, evict the overflow from the combined
      // stream in order — this preserves FIFO semantics across the batch boundary.
      for (const entry of incoming) entries.push(entry);
      if (entries.length > cap) evict(entries.length - cap);
    },
    drain() {
      const out = entries;
      entries = [];
      return out;
    },
    peek() {
      return entries;
    },
    size() {
      return entries.length;
    },
    capacity() {
      return cap;
    },
    clear() {
      entries = [];
    },
  };
}
