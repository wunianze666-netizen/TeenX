import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { advxArenaRepository } from "../services/advx-arena/repository.js";
import { advxVersionService } from "../services/advx-versions.js";

const ORIGINAL_ENV = { ...process.env };
const TEAM_ID = "30000000-0000-4000-8000-000000000001";
const CAPTAIN_ID = "captain-a";
const CHALLENGE_VERSION_ID = "todo-web:v1";
const ATTACHMENT_ID = "40000000-0000-4000-8000-000000000001";

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("ADVX Arena repository compatibility", () => {
  it("resolves the exact retained version for a legacy submission", async () => {
    const paperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "advx-arena-legacy-version-"));
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "arena-legacy-version-test";
    const versionService = advxVersionService(versionDb() as never);
    const retained = await versionService.create(TEAM_ID, {
      teamName: "Historical Team",
      members: [],
      label: "Historical Version",
    });
    const row = submissionRow({ teamVersionId: retained.id, attachmentId: ATTACHMENT_ID });
    const repository = advxArenaRepository(
      fakeDb([[teamRow()], [row], [attachmentRow()]]) as never,
      {} as never,
    );

    try {
      const result = await repository.getChallengeSubmissions(CAPTAIN_ID, CHALLENGE_VERSION_ID);
      expect(result.latestSubmission?.boundTeamVersion).toEqual({
        id: retained.id,
        versionNumber: retained.versionNumber,
        label: "Historical Version",
        teamName: "Historical Team",
        createdAt: retained.createdAt,
      });
    } finally {
      await fs.rm(paperclipHome, { recursive: true, force: true });
    }
  });

  it("keeps the exact version ID with nullable display fields when history was pruned", async () => {
    const paperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "advx-arena-pruned-version-"));
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "arena-pruned-version-test";
    const row = submissionRow({ teamVersionId: "v2-pruned", attachmentId: ATTACHMENT_ID });
    const repository = advxArenaRepository(
      fakeDb([[teamRow()], [row], [attachmentRow()]]) as never,
      {} as never,
    );

    try {
      const result = await repository.getChallengeSubmissions(CAPTAIN_ID, CHALLENGE_VERSION_ID);
      expect(result.latestSubmission?.boundTeamVersion).toEqual({
        id: "v2-pruned",
        versionNumber: null,
        label: null,
        teamName: null,
        createdAt: null,
      });
    } finally {
      await fs.rm(paperclipHome, { recursive: true, force: true });
    }
  });

  it("persists a resolved legacy version when its history is pruned before run creation", async () => {
    const paperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "advx-arena-run-version-"));
    const instanceId = "arena-run-version-test";
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = instanceId;
    const versionService = advxVersionService(versionDb() as never);
    const retained = await versionService.create(TEAM_ID, {
      teamName: "Historical Team",
      members: [],
      label: "Historical Version",
    });
    const expectedBoundVersion = {
      id: retained.id,
      versionNumber: retained.versionNumber,
      label: retained.label,
      teamName: retained.snapshot.teamName,
      createdAt: retained.createdAt,
    };
    const row = submissionRow({ teamVersionId: retained.id, attachmentId: ATTACHMENT_ID });
    const database = runDb([[row], [teamRow()], [row], [], [row]], row);
    const repository = advxArenaRepository(database.db as never, {} as never);

    try {
      const resolved = await repository.getSubmissionForCaptain(row.id, CAPTAIN_ID);
      if (!resolved) throw new TypeError("resolved submission fixture missing");
      await fs.rm(path.join(paperclipHome, "instances", instanceId, "advx-versions", `${TEAM_ID}.json`));

      const created = await repository.createRunIfAbsent({ submission: resolved, official: false });
      const reused = await repository.createRunIfAbsent({ submission: resolved, official: false });

      expect(created.checkpoint.boundTeamVersion).toEqual(expectedBoundVersion);
      expect(created.checkpoint.challengeDigest).toMatch(/^[a-f0-9]{64}$/);
      expect(reused).toMatchObject({ reused: true, checkpoint: { boundTeamVersion: expectedBoundVersion } });
      expect(database.executionState()).toMatchObject({ arena: { boundTeamVersion: expectedBoundVersion } });
      expect(database.executionState()).toMatchObject({ arena: { challengeDigest: created.checkpoint.challengeDigest } });
    } finally {
      await fs.rm(paperclipHome, { recursive: true, force: true });
    }
  });

  it("does not select an issue whose upload has no attachment", async () => {
    const row = submissionRow({ teamVersionId: "v1-incomplete", attachmentId: "" });
    const repository = advxArenaRepository(fakeDb([[teamRow()], [row], []]) as never, {} as never);

    const result = await repository.getChallengeSubmissions(CAPTAIN_ID, CHALLENGE_VERSION_ID);

    expect(result).toEqual({ activeSubmission: null, latestSubmission: null });
  });
});

function submissionRow(input: { teamVersionId: string; attachmentId: string }): MutableSubmissionRow {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    companyId: TEAM_ID,
    originKind: "advx_arena_submission",
    originId: CHALLENGE_VERSION_ID,
    originFingerprint: "a".repeat(64),
    responsibleUserId: CAPTAIN_ID,
    createdByUserId: CAPTAIN_ID,
    createdAt: new Date("2026-07-25T00:00:00.000Z"),
    executionState: {
      arena: {
        schemaVersion: 1,
        challengeVersionId: CHALLENGE_VERSION_ID,
        teamVersionId: input.teamVersionId,
        attachmentId: input.attachmentId,
        artifactSha256: "a".repeat(64),
        originalFilename: "legacy.zip",
        run: null,
      },
    },
  };
}

interface MutableSubmissionRow {
  id: string;
  companyId: string;
  originKind: string;
  originId: string;
  originFingerprint: string;
  responsibleUserId: string;
  createdByUserId: string;
  createdAt: Date;
  executionState: unknown;
}

function teamRow() {
  return { id: TEAM_ID, name: "Current Team", defaultResponsibleUserId: CAPTAIN_ID };
}

function attachmentRow() {
  return { id: ATTACHMENT_ID, byteSize: 123 };
}

function versionDb() {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => [teamRow()] }),
      }),
    }),
  };
}

function fakeDb(responses: unknown[][]) {
  let index = 0;
  return {
    select: () => fakeQuery(responses[index++] ?? []),
  };
}

function runDb(responses: unknown[][], row: MutableSubmissionRow) {
  let index = 0;
  const db = {
    select: () => fakeQuery(responses[index++] ?? []),
    execute: async () => [],
    update: () => ({
      set: (values: { executionState?: unknown }) => ({
        where: async () => {
          if (values.executionState !== undefined) row.executionState = values.executionState;
          return [];
        },
      }),
    }),
    transaction: async (action: (transaction: typeof db) => Promise<unknown>) => action(db),
  };
  return { db, executionState: () => row.executionState };
}

interface FakeQuery {
  from(...args: unknown[]): FakeQuery;
  innerJoin(...args: unknown[]): FakeQuery;
  where(...args: unknown[]): FakeQuery;
  for(...args: unknown[]): FakeQuery;
  orderBy(...args: unknown[]): Promise<unknown[]>;
  then: Promise<unknown[]>["then"];
}

function fakeQuery(rows: unknown[]): FakeQuery {
  const result = Promise.resolve(rows);
  const query: FakeQuery = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    for: () => query,
    orderBy: async () => rows,
    then: result.then.bind(result),
  };
  return query;
}
