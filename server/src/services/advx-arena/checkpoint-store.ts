import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../../home-paths.js";
import { ArenaRepositoryError } from "./repository-error.js";
import type { ArenaRunCheckpoint, ArenaStandard } from "./types.js";
import { readBoundTeamVersion } from "./types.js";

function arenaRoot(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "advx-arena");
}

function standardsDirectory(): string {
  return path.resolve(arenaRoot(), "standards");
}

function runsDirectory(): string {
  return path.resolve(arenaRoot(), "runs");
}

function standardFile(challengeVersionId: string): string {
  if (!/^[a-zA-Z0-9_-]+:v\d+$/.test(challengeVersionId)) {
    throw new ArenaRepositoryError("ARENA_INVALID_CHALLENGE", "赛题版本无效");
  }
  const portableId = challengeVersionId.replace(":", "__");
  return path.resolve(standardsDirectory(), `${portableId}.json`);
}

function runFile(runId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) throw new ArenaRepositoryError("ARENA_RUN_NOT_FOUND", "评审不存在");
  return path.resolve(runsDirectory(), `${runId}.json`);
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export function createArenaCheckpointStore() {
  async function readCheckpoint(runId: string): Promise<ArenaRunCheckpoint | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(runFile(runId), "utf8")) as ArenaRunCheckpoint;
      if (parsed.schemaVersion !== 1 || parsed.runId !== runId || !parsed.state || !Array.isArray(parsed.events)) {
        throw new Error("invalid checkpoint");
      }
      return {
        ...parsed,
        boundTeamVersion: readBoundTeamVersion(parsed.teamVersionId, parsed.boundTeamVersion),
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw new ArenaRepositoryError("ARENA_CHECKPOINT_INVALID", "评审进度文件无效");
    }
  }

  return {
    readCheckpoint,
    listRecoverableCheckpoints: async (): Promise<ArenaRunCheckpoint[]> => {
      let names: string[];
      try {
        names = await fs.readdir(runsDirectory());
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      }
      const checkpoints = await Promise.all(
        names
          .filter((name) => /^[0-9a-f-]{36}\.json$/i.test(name))
          .map((name) => readCheckpoint(name.slice(0, -5))),
      );
      return checkpoints.filter((checkpoint): checkpoint is ArenaRunCheckpoint => checkpoint !== null);
    },
    writeCheckpoint: async (checkpoint: ArenaRunCheckpoint): Promise<void> => {
      await atomicWriteJson(runFile(checkpoint.runId), checkpoint);
    },
    removeCheckpoint: async (runId: string): Promise<void> => {
      await fs.rm(runFile(runId), { force: true });
    },
    readStandard: async (challengeVersionId: string): Promise<ArenaStandard | null> => {
      try {
        const parsed = JSON.parse(await fs.readFile(standardFile(challengeVersionId), "utf8")) as ArenaStandard;
        return parsed.challengeVersionId === challengeVersionId ? parsed : null;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw new ArenaRepositoryError("ARENA_STANDARD_INVALID", "评分标准缓存无效");
      }
    },
    writeStandard: async (standard: ArenaStandard): Promise<void> => {
      await atomicWriteJson(standardFile(standard.challengeVersionId), standard);
    },
  };
}
