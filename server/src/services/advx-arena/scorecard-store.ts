import type { Db } from "@paperclipai/db";
import { getArenaChallenge } from "../advx-arena-catalog.js";
import { logActivity, workProductService } from "../index.js";
import { ArenaRepositoryError } from "./repository-error.js";
import { buildArenaScorecardMetadata } from "./scorecard-metadata.js";
import type { ArenaRunCheckpoint } from "./types.js";

export function createArenaScorecardStore(db: Db) {
  const productService = workProductService(db);

  return {
    createScorecard: async (checkpoint: ArenaRunCheckpoint): Promise<string> => {
      const score = checkpoint.score;
      if (!score) throw new ArenaRepositoryError("ARENA_SCORE_MISSING", "评分结果不存在");
      const metadata = buildArenaScorecardMetadata(checkpoint, score);
      const existing = (await productService.listForIssue(checkpoint.submissionId))
        .find((product) => product.externalId === score.id);
      if (existing) return existing.id;
      const product = await productService.createForIssue(checkpoint.submissionId, checkpoint.teamId, {
        type: "artifact",
        provider: "custom",
        externalId: score.id,
        title: `${getArenaChallenge(checkpoint.challengeVersionId)?.title ?? "Arena"} · Arena Scorecard`,
        status: "ready_for_review",
        reviewState: "none",
        isPrimary: true,
        healthStatus: "healthy",
        summary: score.summary,
        metadata,
      });
      if (!product) throw new ArenaRepositoryError("ARENA_SCORECARD_FAILED", "成绩卡保存失败");
      return product.id;
    },
    logRunActivity: async (
      checkpoint: ArenaRunCheckpoint,
      action: string,
      details: Record<string, string>,
      actor: { type: "user" | "system"; id: string } = { type: "system", id: "advx-arena" },
    ): Promise<void> => {
      await logActivity(db, {
        companyId: checkpoint.teamId,
        actorType: actor.type,
        actorId: actor.id,
        action,
        entityType: "arena_run",
        entityId: checkpoint.runId,
        issueId: checkpoint.submissionId,
        details: {
          challengeVersionId: checkpoint.challengeVersionId,
          submissionId: checkpoint.submissionId,
          runId: checkpoint.runId,
          ...details,
        },
      });
    },
  };
}
