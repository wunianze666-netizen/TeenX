import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { ADVX_MAX_VERSIONS } from "./advx-mapper.js";

const versionWriteQueues = new Map<string, Promise<void>>();

export interface AdvxVersionSnapshot {
  id: string;
  teamId: string;
  versionNumber: number;
  label: string | null;
  snapshot: {
    teamName: string;
    members: Array<{
      id: string;
      name: string;
      roleTemplate: string | null;
      responsibilities: string | null;
      tools: string[];
      skills: string[];
    }>;
  };
  createdAt: string;
}

function versionsDir(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "advx-versions");
}

function teamVersionsFile(teamId: string): string {
  return path.resolve(versionsDir(), `${teamId}.json`);
}

async function readVersions(teamId: string): Promise<AdvxVersionSnapshot[]> {
  try {
    const raw = await fs.readFile(teamVersionsFile(teamId), "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AdvxVersionSnapshot[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeVersions(teamId: string, versions: AdvxVersionSnapshot[]): Promise<void> {
  await fs.mkdir(versionsDir(), { recursive: true });
  const destination = teamVersionsFile(teamId);
  const temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, JSON.stringify(versions, null, 2), { encoding: "utf8", mode: 0o600 });
    await fs.rename(temporary, destination);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

async function withVersionWriteLock<T>(teamId: string, action: () => Promise<T>): Promise<T> {
  const previous = versionWriteQueues.get(teamId) ?? Promise.resolve();
  let release: (() => void) | undefined;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = previous.catch(() => undefined).then(() => current);
  versionWriteQueues.set(teamId, queued);
  await previous.catch(() => undefined);
  try {
    return await action();
  } finally {
    release?.();
    if (versionWriteQueues.get(teamId) === queued) versionWriteQueues.delete(teamId);
  }
}

export function advxVersionService(db: Db) {
  return {
    list: async (teamId: string): Promise<AdvxVersionSnapshot[]> => {
      const versions = await readVersions(teamId);
      return versions.slice().reverse();
    },

    create: async (
      teamId: string,
      input: { members: AdvxVersionSnapshot["snapshot"]["members"]; teamName: string; label?: string | null },
    ): Promise<AdvxVersionSnapshot> => withVersionWriteLock(teamId, async () => {
      const [row] = await db.select().from(companies).where(eq(companies.id, teamId)).limit(1);
      if (!row) throw new Error("Team not found");
      const versions = await readVersions(teamId);
      const nextNumber = Math.max(0, ...versions.map((version) => version.versionNumber)) + 1;
      const snapshot: AdvxVersionSnapshot = {
        id: `v${nextNumber}-${Date.now()}`,
        teamId,
        versionNumber: nextNumber,
        label: input.label ?? null,
        snapshot: {
          teamName: input.teamName,
          members: input.members,
        },
        createdAt: new Date().toISOString(),
      };
      const trimmed = [...versions, snapshot].slice(-ADVX_MAX_VERSIONS);
      await writeVersions(teamId, trimmed);
      return snapshot;
    }),

    getById: async (teamId: string, versionId: string): Promise<AdvxVersionSnapshot | null> => {
      const versions = await readVersions(teamId);
      return versions.find((v) => v.id === versionId) ?? null;
    },

    count: async (teamId: string): Promise<number> => {
      const versions = await readVersions(teamId);
      return versions.length;
    },
  };
}
