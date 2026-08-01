export type TeenxProfileRateLimiter = {
  consume(captainId: string): { readonly allowed: boolean; readonly retryAfterSeconds: number };
};

export function createTeenxProfileRateLimiter(input: {
  readonly windowMs?: number;
  readonly maxChanges?: number;
  readonly now?: () => number;
} = {}): TeenxProfileRateLimiter {
  const windowMs = input.windowMs ?? 60 * 60 * 1_000;
  const maxChanges = input.maxChanges ?? 3;
  const now = input.now ?? Date.now;
  const changes = new Map<string, number[]>();
  return {
    consume(captainId) {
      const current = now();
      const recent = (changes.get(captainId) ?? []).filter((timestamp) => timestamp > current - windowMs);
      if (recent.length >= maxChanges) {
        const oldest = recent[0] ?? current;
        changes.set(captainId, recent);
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - current) / 1_000)) };
      }
      recent.push(current);
      changes.set(captainId, recent);
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
