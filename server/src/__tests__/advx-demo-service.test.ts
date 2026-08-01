import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDb,
  issueAttachments,
  issueWorkProducts,
  issues,
} from "@paperclipai/db";
import { describe, expect, it, vi } from "vitest";
import { createProfiledArenaRuntime } from "../services/advx-demo/runtime.js";
import { createAdvxDemoService } from "../services/advx-demo/service.js";
import { createLocalDiskStorageProvider } from "../storage/local-disk-provider.js";
import { createStorageService } from "../storage/service.js";
import type { ArenaRunCheckpoint } from "../services/advx-arena/types.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const CAPTAIN_ID = "prepared-demo-service-captain";
const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

async function waitForTerminal(
  runtime: Awaited<ReturnType<typeof createProfiledArenaRuntime>>,
  runId: string,
): Promise<ArenaRunCheckpoint> {
  const readTerminal = async () => {
    const checkpoint = await runtime.repository.getCheckpointForCaptain(runId, CAPTAIN_ID);
    return checkpoint?.state.status === "completed" || checkpoint?.state.status === "failed"
      ? checkpoint
      : null;
  };
  const existing = await readTerminal();
  if (existing) return existing;
  return new Promise<ArenaRunCheckpoint>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new TypeError("prepared Arena run did not finish")), 30_000);
    const unsubscribe = runtime.subscribe(runId, (entry) => {
      if (entry.event.type !== "run_completed" && entry.event.type !== "run_failed") return;
      void readTerminal().then((checkpoint) => {
        if (!checkpoint) return;
        clearTimeout(timeout);
        unsubscribe();
        resolve(checkpoint);
      }, reject);
    });
    void readTerminal().then((checkpoint) => {
      if (!checkpoint) return;
      clearTimeout(timeout);
      unsubscribe();
      resolve(checkpoint);
    }, reject);
  });
}

describeEmbeddedPostgres("ADVX prepared Demo service", () => {
  it("uses the real repository, storage, evaluator, and checkpoint lifecycle for prepared_demo", async () => {
    // Given: a disposable database, instance root, local storage, and prepared Demo runtime.
    const originalEnvironment = { ...process.env };
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "advx-demo-service-"));
    const database = await startEmbeddedPostgresTestDatabase("advx-demo-service-db-");
    const db = createDb(database.connectionString);
    process.env.PAPERCLIP_HOME = temporaryRoot;
    process.env.PAPERCLIP_INSTANCE_ID = "prepared-demo-service-test";
    const storage = createStorageService(createLocalDiskStorageProvider(path.join(temporaryRoot, "storage")));
    const runtime = await createProfiledArenaRuntime(db, storage, "prepared_demo");
    const service = createAdvxDemoService(db, runtime, "prepared_demo");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network forbidden"));

    try {
      // When: the server bootstraps and starts its immutable prepared submission twice.
      const bootstrapped = await service.bootstrap(CAPTAIN_ID);
      const first = await service.createPreparedSubmission(CAPTAIN_ID);
      const completed = await waitForTerminal(runtime, first.run.runId);
      const second = await service.createPreparedSubmission(CAPTAIN_ID);

      // Then: one durable submission and run produce the verified non-official 894 score.
      const [submissionRows, attachments, scorecards] = await Promise.all([
        db.select().from(issues),
        db.select().from(issueAttachments),
        db.select().from(issueWorkProducts),
      ]);
      expect(bootstrapped.members.map((member) => member.roleTemplate).sort()).toEqual([
        "builder",
        "critic",
        "inventor",
        "scout",
      ]);
      expect(first.submission.sha256).toBe("8c9c22f4478de9cb56f9137f6fd1324f6267dc93312aeeafe6ed27c5a7b179b4");
      expect(second.submission.id).toBe(first.submission.id);
      expect(second.run).toMatchObject({ runId: first.run.runId, status: "completed", reused: true });
      expect(completed.state.status).toBe("completed");
      expect(completed.modelCallCount).toBe(30);
      expect(completed.score).toMatchObject({ totalScore: 894, totalMaxScore: 1000, official: false });
      expect(submissionRows.filter((row) => row.originKind === "advx_arena_submission")).toHaveLength(1);
      expect(attachments).toHaveLength(1);
      expect(scorecards).toHaveLength(1);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      await runtime.shutdown();
      fetchSpy.mockRestore();
      process.env = originalEnvironment;
      await database.cleanup();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 60_000);

  it("returns only the verified public fixture projection for prepared_replay", async () => {
    // Given: a replay-only runtime whose Arena provider is unavailable by construction.
    const originalEnvironment = { ...process.env };
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "advx-demo-replay-"));
    const database = await startEmbeddedPostgresTestDatabase("advx-demo-replay-db-");
    const db = createDb(database.connectionString);
    process.env.PAPERCLIP_HOME = temporaryRoot;
    process.env.PAPERCLIP_INSTANCE_ID = "prepared-replay-service-test";
    const storage = createStorageService(createLocalDiskStorageProvider(path.join(temporaryRoot, "storage")));
    const runtime = await createProfiledArenaRuntime(db, storage, "prepared_replay");
    const service = createAdvxDemoService(db, runtime, "prepared_replay");

    try {
      // When: the Captain requests the explicit fixture replay.
      const replay = await service.replay(CAPTAIN_ID);

      // Then: no evaluator is available and the response is public, non-official, and truthful.
      expect(runtime.health()).toMatchObject({ modelAvailable: false, mockEnabled: false });
      expect(replay).toMatchObject({
        profile: "prepared_replay",
        fixtureId: "todo-web-v1-r1",
        official: false,
        aiInvoked: false,
        studioGenerated: false,
        result: { totalScore: 894, totalMaxScore: 1000, official: false },
      });
      expect(JSON.stringify(replay)).not.toMatch(/checkpoint|objectKey|modelEndpoint|tokenUsage|cost/i);
    } finally {
      await runtime.shutdown();
      process.env = originalEnvironment;
      await database.cleanup();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
