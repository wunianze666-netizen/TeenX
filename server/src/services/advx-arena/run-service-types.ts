import type { ArenaCheckpointEvent, ArenaRunCheckpoint } from "./types.js";

export type StopReason = "cancel" | "shutdown" | "timeout" | null;
export type EventListener = (event: ArenaCheckpointEvent) => void;

export interface ActiveRun {
  controller: AbortController;
  checkpoint: ArenaRunCheckpoint;
  stopReason: StopReason;
  promise: Promise<void>;
  timeout: ReturnType<typeof setTimeout>;
}
