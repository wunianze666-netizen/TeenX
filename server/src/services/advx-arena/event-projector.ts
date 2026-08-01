import type { ArenaCheckpointEvent } from "./types.js";
import type { ArenaProgressEvent } from "./public-types.js";

export function appendArenaEvent(events: ArenaCheckpointEvent[], event: ArenaProgressEvent): ArenaCheckpointEvent {
  const projected: ArenaCheckpointEvent = {
    id: (events.at(-1)?.id ?? 0) + 1,
    createdAt: new Date().toISOString(),
    event,
  };
  events.push(projected);
  return projected;
}

export function encodeArenaSseEvent(item: ArenaCheckpointEvent): string {
  return `id: ${item.id}\ndata: ${JSON.stringify(item.event)}\n\n`;
}

export function parseArenaCursor(value: unknown): number {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return 0;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}
