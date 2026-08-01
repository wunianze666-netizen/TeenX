import type { Db } from "@paperclipai/db";
import { accessService } from "../access.js";
import { agentService } from "../agents.js";
import { getArenaChallenge } from "../advx-arena-catalog.js";
import { projectArenaScore } from "../advx-arena/public-projector.js";
import type { advxArenaRunService } from "../advx-arena/run-service.js";
import { ADVX_STARTER_TEMPLATE_SLUGS, getRoleTemplate } from "../advx-catalog.js";
import { ADVX_MODEL, buildAgentMetadata, toMemberView, toTeamView } from "../advx-mapper.js";
import { advxVersionService } from "../advx-versions.js";
import { companyService } from "../companies.js";
import { logActivity } from "../activity-log.js";
import { toTeenxTeamView } from "../teenx-advx-dto.js";
import {
  TODO_DEMO_CHALLENGE_VERSION_ID,
  TODO_DEMO_SUBMISSION_SHA256,
  loadTodoDemoFixture,
} from "./fixture.js";
import type { AdvxServerProfile } from "./profile.js";

type ArenaRuntime = ReturnType<typeof advxArenaRunService>;

class AdvxDemoStateError extends Error {
  readonly name = "AdvxDemoStateError";
}

function roleTemplateSlug(member: { readonly metadata: Record<string, unknown> | null }): string | null {
  return typeof member.metadata?.roleTemplate === "string" ? member.metadata.roleTemplate : null;
}

export function createAdvxDemoService(
  db: Db,
  runtime: ArenaRuntime,
  profile: AdvxServerProfile,
) {
  const companies = companyService(db);
  const agents = agentService(db);
  const access = accessService(db);
  const versions = advxVersionService(db);

  async function getCaptainTeam(captainId: string) {
    return companies.list().then((teams) => (
      teams.find((team) => team.defaultResponsibleUserId === captainId) ?? null
    ));
  }

  async function bootstrap(captainId: string) {
    let team = await getCaptainTeam(captainId);
    const created = team === null;
    if (!team) {
      team = await companies.create({
        name: "Todo Makers",
        description: "从组队、试跑到 Arena 评审的完整演示队伍",
        budgetMonthlyCents: 0,
        defaultResponsibleUserId: captainId,
      });
      await access.ensureMembership(team.id, "user", captainId, "owner", "active");
      await logActivity(db, {
        companyId: team.id,
        actorType: "user",
        actorId: captainId,
        action: "company.created",
        entityType: "company",
        entityId: team.id,
        details: { advx: true, preparedDemo: true },
      });
    }

    const currentMembers = await agents.list(team.id);
    const preparedMembers = [...currentMembers];
    for (const slug of ADVX_STARTER_TEMPLATE_SLUGS) {
      if (preparedMembers.some((member) => roleTemplateSlug(member) === slug)) continue;
      const template = getRoleTemplate(slug);
      if (!template) throw new AdvxDemoStateError(`Missing ADVX role template: ${slug}`);
      const member = await agents.create(team.id, {
        name: template.name,
        role: template.slug,
        title: template.name,
        adapterType: "process",
        adapterConfig: { model: ADVX_MODEL },
        metadata: buildAgentMetadata({
          roleTemplate: template.slug,
          responsibilities: template.responsibilities,
          tools: template.defaultTools,
          skills: template.defaultSkills,
        }),
      });
      preparedMembers.push(member);
      await logActivity(db, {
        companyId: team.id,
        actorType: "user",
        actorId: captainId,
        action: "agent.created",
        entityType: "agent",
        entityId: member.id,
        details: { advx: true, preparedDemo: true, roleTemplate: slug },
      });
    }

    const visibleMembers = preparedMembers.filter((member) => roleTemplateSlug(member) !== null);
    return {
      profile,
      team: toTeenxTeamView(toTeamView(team, {
        memberCount: preparedMembers.length,
        versionCount: await versions.count(team.id),
      })),
      members: visibleMembers.map(toMemberView),
      created,
    };
  }

  return {
    bootstrap,
    community: async (captainId: string) => {
      await bootstrap(captainId);
      return {
        profile,
        mode: "local_demo" as const,
        currentUser: {
          username: "demo_captain",
          displayName: "小创",
        },
        stats: {
          topicCount: 3,
          postCount: 22,
          bookmarkCount: 2,
          unreadMessages: 1,
        },
        categories: [
          { id: "showcase", name: "作品展示", topicCount: 1 },
          { id: "build-log", name: "制作日志", topicCount: 1 },
          { id: "help", name: "互助问答", topicCount: 1 },
        ],
        topics: [
          {
            id: "todo-makers-launch",
            categoryId: "showcase",
            title: "Todo Makers：从想法到可运行网页",
            excerpt: "Scout、Inventor、Builder 和 Critic 如何协作完成第一版作品。",
            author: "Todo Makers",
            replyCount: 6,
            viewCount: 128,
            createdAt: "2026-07-31T10:20:00.000Z",
            tags: ["团队协作", "Web"],
            featured: true,
          },
          {
            id: "review-checklist",
            categoryId: "build-log",
            title: "Critic 的发布前检查清单",
            excerpt: "用可访问性、异常状态和移动端三个维度完成最后一次检查。",
            author: "Pixel Pioneers",
            replyCount: 4,
            viewCount: 86,
            createdAt: "2026-07-30T08:45:00.000Z",
            tags: ["评审", "质量"],
            featured: false,
          },
          {
            id: "first-arena-run",
            categoryId: "help",
            title: "第一次参加 Arena，应该怎样准备队伍版本？",
            excerpt: "从保存版本、整理作品到阅读评分证据的完整准备过程。",
            author: "Logic Lab",
            replyCount: 9,
            viewCount: 203,
            createdAt: "2026-07-29T14:10:00.000Z",
            tags: ["Arena", "入门"],
            featured: false,
          },
        ],
        bookmarks: ["review-checklist", "first-arena-run"],
      };
    },
    leaderboard: async (captainId: string) => {
      const [prepared, fixture] = await Promise.all([
        bootstrap(captainId),
        loadTodoDemoFixture(),
      ]);
      const challenge = getArenaChallenge(TODO_DEMO_CHALLENGE_VERSION_ID);
      if (!challenge) throw new AdvxDemoStateError("Prepared ADVX challenge is unavailable");
      const entries = [
        { teamId: "demo-pixel-pioneers", teamName: "Pixel Pioneers", score: 926, completedAt: "2026-07-31T09:10:00.000Z", isCurrent: false },
        { teamId: prepared.team.id, teamName: prepared.team.name, score: fixture.score.totalScore, completedAt: fixture.score.scoredAt, isCurrent: true },
        { teamId: "demo-logic-lab", teamName: "Logic Lab", score: 861, completedAt: "2026-07-30T12:30:00.000Z", isCurrent: false },
        { teamId: "demo-spark-studio", teamName: "Spark Studio", score: 824, completedAt: "2026-07-29T15:40:00.000Z", isCurrent: false },
        { teamId: "demo-code-crafters", teamName: "Code Crafters", score: 788, completedAt: "2026-07-28T11:05:00.000Z", isCurrent: false },
      ].sort((left, right) => right.score - left.score).map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
      return {
        profile,
        mode: "prepared_fixture" as const,
        official: false as const,
        challenge: {
          challengeVersionId: TODO_DEMO_CHALLENGE_VERSION_ID,
          title: challenge.title,
          totalMaxScore: fixture.score.totalMaxScore,
        },
        entries,
        currentTeamRank: entries.find((entry) => entry.isCurrent)?.rank ?? null,
      };
    },
    createPreparedSubmission: async (captainId: string) => {
      await bootstrap(captainId);
      const fixture = await loadTodoDemoFixture();
      const challenge = getArenaChallenge(TODO_DEMO_CHALLENGE_VERSION_ID);
      if (!challenge) throw new AdvxDemoStateError("Prepared ADVX challenge is unavailable");
      const latest = await runtime.repository.getLatestSubmission(captainId, TODO_DEMO_CHALLENGE_VERSION_ID);
      const submission = latest?.sha256 === TODO_DEMO_SUBMISSION_SHA256
        ? latest
        : await runtime.repository.createSubmission({
          captainId,
          challengeVersionId: TODO_DEMO_CHALLENGE_VERSION_ID,
          challengeTitle: challenge.title,
          file: { buffer: fixture.archive, originalname: "todo-demo.zip" },
        });
      const record = await runtime.repository.getSubmissionForCaptain(submission.id, captainId);
      if (!record || record.artifactSha256 !== TODO_DEMO_SUBMISSION_SHA256) {
        throw new AdvxDemoStateError("Prepared ADVX submission identity is invalid");
      }
      const run = await runtime.start(record);
      const projected = await runtime.repository.getLatestSubmission(captainId, TODO_DEMO_CHALLENGE_VERSION_ID);
      if (!projected || projected.id !== submission.id) {
        throw new AdvxDemoStateError("Prepared ADVX submission projection is unavailable");
      }
      return { submission: projected, run };
    },
    replay: async (_captainId: string) => {
      const fixture = await loadTodoDemoFixture();
      return {
        profile: "prepared_replay" as const,
        fixtureId: fixture.manifest.fixtureId,
        fixtureRevision: fixture.manifest.revision,
        challengeVersionId: fixture.manifest.challengeVersionId,
        submissionSha256: fixture.archiveSha256,
        official: false as const,
        aiInvoked: false as const,
        studioGenerated: false as const,
        result: projectArenaScore(fixture.score),
      };
    },
  };
}

export type AdvxDemoService = ReturnType<typeof createAdvxDemoService>;
