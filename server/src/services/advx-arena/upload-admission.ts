export type ArenaUploadAdmission =
  | { readonly allowed: true; readonly release: () => void }
  | { readonly allowed: false; readonly reason: "concurrency" | "rate"; readonly retryAfterSeconds: number };

export function createArenaUploadAdmissionGate(options: {
  readonly maxConcurrent: number;
  readonly maxGlobalConcurrent: number;
  readonly maxAttempts: number;
  readonly windowMs: number;
  readonly now?: () => number;
}) {
  const active = new Map<string, number>();
  let activeGlobal = 0;
  const attempts = new Map<string, number[]>();
  const now = options.now ?? Date.now;
  return {
    acquire(key: string): ArenaUploadAdmission {
      const timestamp = now();
      const recent = (attempts.get(key) ?? []).filter((item) => timestamp - item < options.windowMs);
      if ((active.get(key) ?? 0) >= options.maxConcurrent || activeGlobal >= options.maxGlobalConcurrent) {
        return { allowed: false, reason: "concurrency", retryAfterSeconds: 1 };
      }
      if (recent.length >= options.maxAttempts) {
        const retryAfterSeconds = Math.max(1, Math.ceil((options.windowMs - (timestamp - (recent[0] ?? timestamp))) / 1_000));
        attempts.set(key, recent);
        return { allowed: false, reason: "rate", retryAfterSeconds };
      }
      recent.push(timestamp);
      attempts.set(key, recent);
      active.set(key, (active.get(key) ?? 0) + 1);
      activeGlobal += 1;
      let released = false;
      return {
        allowed: true,
        release: () => {
          if (released) return;
          released = true;
          activeGlobal -= 1;
          const remaining = (active.get(key) ?? 1) - 1;
          if (remaining > 0) active.set(key, remaining);
          else active.delete(key);
        },
      };
    },
  };
}

export type ArenaUploadAdmissionGate = ReturnType<typeof createArenaUploadAdmissionGate>;
