export function createKeyedSerialQueue() {
  const queues = new Map<string, Promise<void>>();

  return async function runSerially<T>(key: string, action: () => Promise<T>): Promise<T> {
    const previous = queues.get(key) ?? Promise.resolve();
    let release: (() => void) | undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.catch(() => undefined).then(() => current);
    queues.set(key, queued);
    await previous.catch(() => undefined);
    try {
      return await action();
    } finally {
      release?.();
      if (queues.get(key) === queued) queues.delete(key);
    }
  };
}
