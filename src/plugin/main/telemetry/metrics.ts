// In-memory counters for the plugin main thread. Exposed via the
// `widget.snapshot` command so `memi doctor --json` and other operators
// can observe error rates without grepping logs (#61).
//
// This module is intentionally tiny and allocation-free: it's hit on
// every command and every document change, so any heap churn here would
// dominate plugin GC. Counters are typed as labeled string maps.

export type CounterName =
  | "cmd_total"              // labels: status (ok|err), command
  | "change_buffer_drops"    // unlabeled: count of dropped batches
  | "reconnects"             // unlabeled: bridge reconnect attempts
  | "queue_depth"            // labels: kind (pending|jobs)
  | "exec_rejects"           // labels: reason (code)
  | "selection_throttled"    // unlabeled
  | "bridge_send_failed";    // unlabeled

type LabelMap = Record<string, number>;

export interface MetricsSnapshot {
  cmd_total: LabelMap;
  change_buffer_drops: number;
  reconnects: number;
  queue_depth: LabelMap;
  exec_rejects: LabelMap;
  selection_throttled: number;
  bridge_send_failed: number;
  startedAt: number;
  sampledAt: number;
}

export interface MetricsRegistry {
  inc(name: CounterName, labelKey?: string, delta?: number): void;
  set(name: CounterName, labelKey: string, value: number): void;
  snapshot(): MetricsSnapshot;
  reset(): void;
}

export function createMetricsRegistry(now: () => number = Date.now): MetricsRegistry {
  const startedAt = now();
  const cmd_total: LabelMap = Object.create(null);
  let change_buffer_drops = 0;
  let reconnects = 0;
  const queue_depth: LabelMap = Object.create(null);
  const exec_rejects: LabelMap = Object.create(null);
  let selection_throttled = 0;
  let bridge_send_failed = 0;

  function bumpLabeled(map: LabelMap, key: string, delta: number): void {
    const current = map[key];
    map[key] = (current === undefined ? 0 : current) + delta;
  }

  return {
    inc(name, labelKey, delta = 1) {
      switch (name) {
        case "cmd_total":
          bumpLabeled(cmd_total, labelKey ?? "unknown", delta);
          return;
        case "change_buffer_drops":
          change_buffer_drops += delta;
          return;
        case "reconnects":
          reconnects += delta;
          return;
        case "queue_depth":
          bumpLabeled(queue_depth, labelKey ?? "pending", delta);
          return;
        case "exec_rejects":
          bumpLabeled(exec_rejects, labelKey ?? "unknown", delta);
          return;
        case "selection_throttled":
          selection_throttled += delta;
          return;
        case "bridge_send_failed":
          bridge_send_failed += delta;
          return;
      }
    },
    set(name, labelKey, value) {
      switch (name) {
        case "queue_depth":
          queue_depth[labelKey] = value;
          return;
        case "cmd_total":
          cmd_total[labelKey] = value;
          return;
        case "exec_rejects":
          exec_rejects[labelKey] = value;
          return;
        default:
          // Scalar counters don't support set(); no-op so callers
          // can't accidentally rewrite history.
          return;
      }
    },
    snapshot() {
      return {
        cmd_total: { ...cmd_total },
        change_buffer_drops,
        reconnects,
        queue_depth: { ...queue_depth },
        exec_rejects: { ...exec_rejects },
        selection_throttled,
        bridge_send_failed,
        startedAt,
        sampledAt: now(),
      };
    },
    reset() {
      for (const k of Object.keys(cmd_total)) delete cmd_total[k];
      for (const k of Object.keys(queue_depth)) delete queue_depth[k];
      for (const k of Object.keys(exec_rejects)) delete exec_rejects[k];
      change_buffer_drops = 0;
      reconnects = 0;
      selection_throttled = 0;
      bridge_send_failed = 0;
    },
  };
}
