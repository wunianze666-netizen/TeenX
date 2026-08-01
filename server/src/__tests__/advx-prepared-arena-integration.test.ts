import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { companies, createDb, issueWorkProducts, issues } from "@paperclipai/db";
import { describe, expect, it, vi } from "vitest";
import type { StorageService } from "../storage/types.js";
import { createArenaCheckpointStore } from "../services/advx-arena/checkpoint-store.js";
import type { ArenaProgressEvent, ArenaStage } from "../services/advx-arena/public-types.js";
import { advxArenaRunService } from "../services/advx-arena/run-service.js";
import { createArenaScorecardStore } from "../services/advx-arena/scorecard-store.js";
import { validateCheckpointArenaScore } from "../services/advx-arena/checkpoint-score-validator.js";
import type { ArenaRunCheckpoint } from "../services/advx-arena/types.js";
import { createPreparedArenaProvider } from "../services/advx-demo/prepared-arena-provider.js";
import {
  TODO_DEMO_CHALLENGE_VERSION_ID,
  TODO_DEMO_SUBMISSION_SHA256,
  loadTodoDemoFixture,
} from "../services/advx-demo/fixture.js";
import { baseCheckpoint, submissionFromCheckpoint } from "./advx-arena-test-fixtures.js";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

describeEmbeddedPostgres("ADVX prepared Arena lifecycle integration", () => {
  it("traverses the unchanged run service and persists the projected 894 scorecard", async () => {
    // Given: the verified archive, temporary durable storage, and a real temporary database.
    const originalEnvironment = { ...process.env };
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), "advx-prepared-arena-"));
    const database = await startEmbeddedPostgresTestDatabase("advx-prepared-arena-db-");
    const db = createDb(database.connectionString);
    const archivePath = path.join(temporaryRoot, "submission.zip");
    process.env.PAPERCLIP_HOME = temporaryRoot;
    process.env.PAPERCLIP_INSTANCE_ID = "prepared-arena-provider-test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network forbidden"));
    let runtime: ReturnType<typeof advxArenaRunService> | null = null;

    try {
      const fixture = await loadTodoDemoFixture();
      await writeFile(archivePath, fixture.archive);
      const companyId = randomUUID();
      const submissionId = randomUUID();
      const runId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: "Prepared Arena Team",
        issuePrefix: `PD${companyId.slice(0, 6).toUpperCase()}`,
        defaultResponsibleUserId: "prepared-captain",
      });
      await db.insert(issues).values({
        id: submissionId,
        companyId,
        title: "Prepared Arena submission",
        originKind: "advx_arena_submission",
        originId: TODO_DEMO_CHALLENGE_VERSION_ID,
        originFingerprint: TODO_DEMO_SUBMISSION_SHA256,
        createdByUserId: "prepared-captain",
        responsibleUserId: "prepared-captain",
      });

      const provider = await createPreparedArenaProvider();
      const checkpointStore = createArenaCheckpointStore();
      const scorecardStore = createArenaScorecardStore(db);
      const checkpoint = preparedCheckpoint(fixture.archive, runId, companyId, submissionId);
      const repository = {
        getCaptainTeam: async () => { throw new TypeError("integration uses its prepared team"); },
        createSubmission: async () => { throw new TypeError("integration starts from a prepared submission"); },
        getChallengeSubmissions: async () => { throw new TypeError("integration does not query submissions"); },
        getLatestSubmission: async () => { throw new TypeError("integration does not query submissions"); },
        getSubmissionForCaptain: async () => { throw new TypeError("integration owns its prepared submission"); },
        createRunIfAbsent: async () => {
          await checkpointStore.writeCheckpoint(checkpoint);
          return { checkpoint, reused: false };
        },
        readCheckpoint: checkpointStore.readCheckpoint,
        writeCheckpoint: checkpointStore.writeCheckpoint,
        updatePublicRunState: async () => undefined,
        logRunActivity: async () => undefined,
        loadArchive: async () => readFile(archivePath),
        readStandard: checkpointStore.readStandard,
        writeStandard: checkpointStore.writeStandard,
        createScorecard: scorecardStore.createScorecard,
        listRecoverableCheckpoints: checkpointStore.listRecoverableCheckpoints,
        getCheckpointForCaptain: async () => checkpointStore.readCheckpoint(runId),
      };
      const unusedStorage: StorageService = {
        provider: "local_disk",
        putFile: async () => { throw new TypeError("repository override must own storage"); },
        getObject: async () => { throw new TypeError("repository override must own storage"); },
        headObject: async () => { throw new TypeError("repository override must own storage"); },
        deleteObject: async () => { throw new TypeError("repository override must own storage"); },
      };
      runtime = advxArenaRunService(db, unusedStorage, { repository, provider });
      const liveEvents: ArenaProgressEvent[] = [];
      let releaseTerminal: (() => void) | undefined;
      const terminal = new Promise<void>((resolve) => { releaseTerminal = resolve; });
      const unsubscribe = runtime.subscribe(runId, (event) => {
        liveEvents.push(event.event);
        if (event.event.type === "run_completed" || event.event.type === "run_failed") releaseTerminal?.();
      });

      // When: the normal run service schedules the prepared provider through evaluateArenaRun.
      await runtime.start(submissionFromCheckpoint(checkpoint));
      await terminal;
      unsubscribe();

      // Then: every normal stage and dimension completes and durable public artifacts are exact.
      const completed = await checkpointStore.readCheckpoint(runId);
      if (!completed?.score) throw new TypeError("prepared Arena run did not persist a score");
      expect(completed.state.status).toBe("completed");
      expect(completed.modelCallCount).toBe(30);
      expect(completed.standard?.provenance.mode).toBe("prepared_demo");
      expect(completed.score).toMatchObject({
        totalScore: 894,
        totalMaxScore: 1000,
        official: false,
        submissionSha256: TODO_DEMO_SUBMISSION_SHA256,
      });
      expect(completed.score.dimensions).toHaveLength(8);
      expect(completed.state.completedDimensions).toHaveLength(8);
      expect(stageStatuses(completed)).toEqual(expectedStageStatuses());
      expect(liveEvents.filter((event) => event.type === "dimension" && event.status === "completed")).toHaveLength(8);
      expect(evidenceCount(completed)).toBe(53);
      expect(relocationWarningCount(completed)).toBe(53);
      expectEvidenceMatchesSource(completed, fixture.parsedSubmission.files);

      const scorecards = await db.select().from(issueWorkProducts);
      expect(scorecards).toHaveLength(1);
      expect(scorecards[0]).toMatchObject({
        issueId: submissionId,
        companyId,
        externalId: completed.score.id,
        isPrimary: true,
      });
      expect(scorecards[0]?.metadata).toMatchObject({
        official: false,
        submissionSha256: TODO_DEMO_SUBMISSION_SHA256,
        arenaScore: { totalScore: 894, totalMaxScore: 1000, official: false },
      });
      expect(fetchSpy).not.toHaveBeenCalled();
      const mismatchedPreparedCheckpoint = structuredClone(completed);
      mismatchedPreparedCheckpoint.submissionSha256 = "0".repeat(64);
      mismatchedPreparedCheckpoint.score.submissionSha256 = "0".repeat(64);
      expect(() => validateCheckpointArenaScore(mismatchedPreparedCheckpoint)).toThrow(
        "评分来源与评审模式不一致",
      );
      await expect(provider.call("TASK:ANALYZE_SUBMISSION:requirements", {
        label: "analysis.requirements",
        maxTokens: 100,
      })).rejects.toMatchObject({ reason: "exhausted" });
    } finally {
      await runtime?.shutdown();
      fetchSpy.mockRestore();
      process.env = originalEnvironment;
      await database.cleanup();
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 60_000);
});

function preparedCheckpoint(archive: Buffer, runId: string, teamId: string, submissionId: string): ArenaRunCheckpoint {
  const checkpoint = baseCheckpoint(archive, runId);
  checkpoint.teamId = teamId;
  checkpoint.submissionId = submissionId;
  checkpoint.captainId = "prepared-captain";
  checkpoint.teamVersionId = "prepared-team-version-r1";
  checkpoint.boundTeamVersion = {
    id: checkpoint.teamVersionId,
    versionNumber: 1,
    label: "Prepared r1",
    teamName: "Prepared Arena Team",
    createdAt: "2026-07-25T00:00:00.000Z",
  };
  checkpoint.submissionSha256 = TODO_DEMO_SUBMISSION_SHA256;
  return checkpoint;
}

function stageStatuses(checkpoint: ArenaRunCheckpoint): string[] {
  return checkpoint.events.flatMap((entry) => entry.event.type === "stage"
    ? [`${entry.event.stage}:${entry.event.status}`]
    : []);
}

function expectedStageStatuses(): string[] {
  const stages: ArenaStage[] = ["challenge", "standard", "analysis", "scoring", "summary"];
  return stages.flatMap((stage) => [`${stage}:started`, `${stage}:completed`]);
}

function evidenceCount(checkpoint: ArenaRunCheckpoint): number {
  return checkpoint.score?.dimensions.reduce(
    (dimensionTotal, dimension) => dimensionTotal + dimension.subScores.reduce(
      (subScoreTotal, subScore) => subScoreTotal + subScore.evidence.length,
      0,
    ),
    0,
  ) ?? 0;
}

function relocationWarningCount(checkpoint: ArenaRunCheckpoint): number {
  return checkpoint.score?.dimensions.reduce(
    (dimensionTotal, dimension) => dimensionTotal + dimension.subScores.reduce(
      (subScoreTotal, subScore) => subScoreTotal
        + subScore.evidenceWarnings.filter((warning) => warning.includes("已由服务端纠正")).length,
      0,
    ),
    0,
  ) ?? 0;
}

function expectEvidenceMatchesSource(
  checkpoint: ArenaRunCheckpoint,
  files: readonly { readonly path: string; readonly content: string }[],
): void {
  for (const dimension of checkpoint.score?.dimensions ?? []) {
    for (const subScore of dimension.subScores) {
      for (const evidence of subScore.evidence) {
        const source = files.find((file) => file.path === evidence.path);
        expect(source, evidence.path).toBeDefined();
        const quote = source?.content.split("\n").slice(evidence.lineStart - 1, evidence.lineEnd).join("\n");
        expect(quote).toBe(evidence.quote);
      }
    }
  }
}
