import type { Request, Response } from "express";
import { encodeArenaSseEvent } from "./event-projector.js";
import { projectArenaCheckpointEvent } from "./public-projector.js";
import { ArenaRepositoryError } from "./repository-error.js";
import type { advxArenaRunService } from "./run-service.js";
import type { ArenaCheckpointEvent } from "./types.js";

type ArenaSseRuntime = Pick<ReturnType<typeof advxArenaRunService>, "repository" | "subscribe">;

type ArenaSseStreamInput = {
  readonly req: Request;
  readonly res: Response;
  readonly runtime: ArenaSseRuntime;
  readonly runId: string;
  readonly captainId: string;
  readonly cursor: number;
};

export async function streamArenaEvents(input: ArenaSseStreamInput): Promise<void> {
  const { req, res, runtime, runId, captainId, cursor } = input;
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let unsubscribe: (() => void) | undefined;
  let handoffComplete = false;
  let nextEventId = cursor + 1;
  const buffered = new Map<number, ArenaCheckpointEvent>();
  const close = () => {
    if (closed) return;
    closed = true;
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
    if (!res.writableEnded) res.end();
  };
  const enqueue = (event: ArenaCheckpointEvent) => {
    const projected = projectArenaCheckpointEvent(event);
    if (projected.id >= nextEventId && !buffered.has(projected.id)) buffered.set(projected.id, projected);
  };
  const drain = () => {
    while (!closed) {
      const event = buffered.get(nextEventId);
      if (!event) return;
      buffered.delete(nextEventId);
      res.write(encodeArenaSseEvent(event));
      nextEventId += 1;
      if (isTerminalEvent(event)) close();
    }
  };

  unsubscribe = runtime.subscribe(runId, (event) => {
    if (closed) return;
    enqueue(event);
    if (handoffComplete) drain();
  });
  heartbeat = setInterval(() => {
    if (!closed) res.write(`: heartbeat ${Date.now()}\n\n`);
  }, 15_000);
  req.once("close", close);

  let checkpoint: Awaited<ReturnType<ArenaSseRuntime["repository"]["getCheckpointForCaptain"]>>;
  try {
    checkpoint = await runtime.repository.getCheckpointForCaptain(runId, captainId);
  } catch (error) {
    if (error instanceof ArenaRepositoryError) {
      close();
      return;
    }
    throw error;
  }
  if (!checkpoint) {
    close();
    return;
  }
  for (const event of checkpoint.events) enqueue(event);
  handoffComplete = true;
  drain();
  const lastEventId = checkpoint.events.at(-1)?.id ?? 0;
  if (isTerminalStatus(checkpoint.state.status) && cursor >= lastEventId) close();
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isTerminalEvent(event: ArenaCheckpointEvent): boolean {
  return event.event.type === "run_completed" || event.event.type === "run_failed" || event.event.type === "run_cancelled";
}
