import { and, eq, sql } from "drizzle-orm";
import { agents, authUsers, companies, companyMemberships, heartbeatRuns, type Db } from "@paperclipai/db";
import type { TeenxCaptainRecord, TeenxProfileStore, TeenxTeamSummary } from "../routes/advx-profile.js";
import { advxVersionService } from "./advx-versions.js";
import { logActivity } from "./index.js";
import type { EligibleCaptain } from "./teenx-public-directory.js";

export function createTeenxProfileStore(db: Db): TeenxProfileStore {
  const versions = advxVersionService(db);

  const getCaptain = async (captainId: string): Promise<TeenxCaptainRecord | null> =>
    db.select({ captainId: authUsers.id, nickname: authUsers.name, joinedAt: authUsers.createdAt })
      .from(authUsers)
      .where(eq(authUsers.id, captainId))
      .then((rows) => rows[0] ?? null);

  const getTeamSummary = async (captainId: string): Promise<TeenxTeamSummary | null> => {
    const team = await db.select({ teamId: companies.id, name: companies.name })
      .from(companies)
      .innerJoin(companyMemberships, and(
        eq(companyMemberships.companyId, companies.id),
        eq(companyMemberships.principalType, "user"),
        eq(companyMemberships.principalId, captainId),
        eq(companyMemberships.membershipRole, "owner"),
        eq(companyMemberships.status, "active"),
      ))
      .where(and(eq(companies.defaultResponsibleUserId, captainId), eq(companies.status, "active")))
      .then((rows) => rows[0] ?? null);
    if (!team) return null;
    const [memberRow, versionCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` })
        .from(agents)
        .where(eq(agents.companyId, team.teamId))
        .then((rows) => rows[0] ?? { count: 0 }),
      versions.count(team.teamId),
    ]);
    return { ...team, memberCount: Number(memberRow.count), versionCount };
  };

  return {
    getCaptain,
    updateNickname: async (captainId, nickname) =>
      db.update(authUsers)
        .set({ name: nickname, updatedAt: new Date() })
        .where(eq(authUsers.id, captainId))
        .returning({ captainId: authUsers.id, nickname: authUsers.name, joinedAt: authUsers.createdAt })
        .then((rows) => rows[0] ?? null),
    getTeamSummary,
    auditIdentityChange: async (teamId, captainId) => {
      await logActivity(db, {
        companyId: teamId,
        actorType: "user",
        actorId: captainId,
        action: "advx.profile.identity_updated",
        entityType: "company",
        entityId: teamId,
        details: { changedFields: ["nickname"] },
      });
    },
    loadEligibleCaptains: async (limit): Promise<readonly EligibleCaptain[]> =>
      db.select({
        captainId: companies.defaultResponsibleUserId,
        teamId: companies.id,
        teamName: companies.name,
        teamCreatedAt: companies.createdAt,
      })
        .from(companies)
        .innerJoin(companyMemberships, and(
          eq(companyMemberships.companyId, companies.id),
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, companies.defaultResponsibleUserId),
          eq(companyMemberships.membershipRole, "owner"),
          eq(companyMemberships.status, "active"),
        ))
        .innerJoin(authUsers, eq(authUsers.id, companies.defaultResponsibleUserId))
        .where(eq(companies.status, "active"))
        .orderBy(companies.defaultResponsibleUserId, companies.id)
        .limit(limit)
        .then((rows) => rows.flatMap((row) => row.captainId ? [{ ...row, captainId: row.captainId }] : [])),
    getTestRunCount: async (teamId) =>
      db.select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns)
        .where(and(
          eq(heartbeatRuns.companyId, teamId),
          sql`${heartbeatRuns.contextSnapshot} ->> 'source' = 'advx_test_run'`,
        ))
        .then((rows) => Number(rows[0]?.count ?? 0)),
  };
}
