import { createHash } from "node:crypto";
import { deflateRawSync } from "node:zlib";
import type { ArenaModelProvider } from "../services/advx-arena/model-provider.js";
import { getArenaChallenge } from "../services/advx-arena-catalog.js";
import { DIMENSION_SKELETON } from "../services/advx-arena/scoring-contract.js";
import type {
  ArenaRunCheckpoint,
  ArenaSubmissionRecord,
  Criterion,
} from "../services/advx-arena/types.js";

export interface ZipEntryInput {
  name: string;
  content: string;
  encrypted?: boolean;
  compress?: boolean;
}

export function createZip(entries: ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.content, "utf8");
    const compressed = entry.compress ? deflateRawSync(raw) : raw;
    const method = entry.compress ? 8 : 0;
    const flags = 0x800 | (entry.encrypted ? 0x1 : 0);
    const checksum = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }
  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

export function fixtureCriteria(): Criterion[] {
  return DIMENSION_SKELETON.map((dimension) => {
    const first = Math.floor(dimension.maxScore / 3);
    const second = Math.floor(dimension.maxScore / 3);
    return {
      name: dimension.name,
      maxScore: dimension.maxScore,
      rubric: dimension.focus,
      subCriteria: [
        { name: `${dimension.name}-1`, maxScore: first, anchor0: "none", anchorPartial: "some", anchorFull: "all" },
        { name: `${dimension.name}-2`, maxScore: second, anchor0: "none", anchorPartial: "some", anchorFull: "all" },
        { name: `${dimension.name}-3`, maxScore: dimension.maxScore - first - second, anchor0: "none", anchorPartial: "some", anchorFull: "all" },
      ],
    };
  });
}

export function boundTeamVersion(id: string, versionNumber: number, teamName: string) {
  return {
    id,
    versionNumber,
    label: `Version ${versionNumber}`,
    teamName,
    createdAt: "2026-07-25T00:00:00.000Z",
  };
}

export function baseCheckpoint(archive: Buffer, runId: string): ArenaRunCheckpoint {
  const challenge = getArenaChallenge("todo-web:v1");
  if (!challenge) throw new TypeError("challenge fixture missing");
  return {
    schemaVersion: 1,
    runId,
    submissionId: "20000000-0000-4000-8000-000000000001",
    teamId: "30000000-0000-4000-8000-000000000001",
    captainId: "captain-test",
    challengeVersionId: "todo-web:v1",
    teamVersionId: "v1-test",
    boundTeamVersion: boundTeamVersion("v1-test", 1, "Arena Team"),
    attachmentId: "40000000-0000-4000-8000-000000000001",
    submissionSha256: sha256(archive),
    originalFilename: "submission.zip",
    official: false,
    state: {
      runId,
      status: "queued",
      stage: null,
      completedDimensions: [],
      startedAt: null,
      finishedAt: null,
      failureCode: null,
      failureMessage: null,
      scoreWorkProductId: null,
    },
    cancelRequestedAt: null,
    modelCallCount: 0,
    dimensionScores: {},
    events: [],
    challengeDigest: challenge.contentDigest,
  };
}

export function preparedScoringCheckpoint(): ArenaRunCheckpoint {
  const checkpoint = baseCheckpoint(Buffer.from("prepared"), "10000000-0000-4000-8000-000000000009");
  checkpoint.submissionId = "20000000-0000-4000-8000-000000000009";
  checkpoint.teamId = "30000000-0000-4000-8000-000000000009";
  checkpoint.captainId = "captain-cancel";
  checkpoint.teamVersionId = "v1-cancel";
  checkpoint.boundTeamVersion = boundTeamVersion("v1-cancel", 1, "Cancel Team");
  checkpoint.attachmentId = "40000000-0000-4000-8000-000000000009";
  checkpoint.submissionSha256 = "a".repeat(64);
  checkpoint.originalFilename = "cancel.zip";
  checkpoint.state.runId = checkpoint.runId;
  checkpoint.standard = {
    id: "standard-cancel",
    challengeVersionId: "todo-web:v1",
    criteria: fixtureCriteria(),
    totalMaxScore: 1000,
    rubricVersion: "arena-rubric-v3",
    generatedAt: "2026-07-25T00:00:00.000Z",
    challengeDigest: checkpoint.challengeDigest ?? "",
    provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
  };
  checkpoint.parsedSubmission = {
    fileList: ["app.js"],
    files: [{ path: "app.js", content: "const todo = true;", size: 18 }],
    totalSize: 18,
    includedCharacters: 18,
    omittedFiles: [],
    truncatedFiles: [],
  };
  checkpoint.sourceText = '<file path="app.js" size=18>\nL1: const todo = true;\n</file>';
  checkpoint.evidenceFiles = [{ path: "app.js", content: "const todo = true;", size: 18 }];
  checkpoint.analysis = {
    fileCount: 1,
    totalLines: 1,
    totalSize: 18,
    fileList: ["app.js"],
    languages: ["JavaScript"],
    analysis: "static analysis",
    analysisPasses: [{ name: "review", focus: "test", content: "static analysis" }],
    coverage: {
      listedFileCount: 1,
      includedFileCount: 1,
      includedCharacters: 18,
      omittedFiles: [],
      truncatedFiles: [],
      limitations: ["static only"],
    },
    rawContent: "internal",
  };
  return checkpoint;
}

export function submissionFromCheckpoint(checkpoint: ArenaRunCheckpoint): ArenaSubmissionRecord {
  return {
    id: checkpoint.submissionId,
    teamId: checkpoint.teamId,
    captainId: checkpoint.captainId,
    challengeVersionId: checkpoint.challengeVersionId,
    teamVersionId: checkpoint.teamVersionId,
    boundTeamVersion: checkpoint.boundTeamVersion,
    attachmentId: checkpoint.attachmentId,
    artifactSha256: checkpoint.submissionSha256,
    originalFilename: checkpoint.originalFilename,
    createdAt: "2026-07-25T00:00:00.000Z",
    run: checkpoint.state,
  };
}

export function blockingProvider(): ArenaModelProvider {
  return {
    available: true,
    official: false,
    contextWindow: 8192,
    unavailableReason: null,
    provenance: { mode: "mock", model: "mock", policy: "deepseek-fixed-v1" },
    call: async (_prompt, options) => new Promise<string>((_resolve, reject) => {
      const abort = () => reject(options.signal?.reason ?? new Error("aborted"));
      if (options.signal?.aborted) abort();
      else options.signal?.addEventListener("abort", abort, { once: true });
    }),
  };
}

export function recoveryRepository(
  checkpoints: ArenaRunCheckpoint[],
  onWrite: (checkpoint: ArenaRunCheckpoint) => void,
) {
  return {
    listRecoverableCheckpoints: async () => checkpoints,
    writeCheckpoint: async (checkpoint: ArenaRunCheckpoint) => { onWrite(checkpoint); },
    updatePublicRunState: async () => undefined,
    logRunActivity: async () => undefined,
    loadArchive: async () => Buffer.alloc(0),
    readStandard: async () => checkpoints[0]?.standard ?? null,
    writeStandard: async () => undefined,
    createScorecard: async () => "50000000-0000-4000-8000-000000000009",
  };
}

function crc32(input: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of input) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sha256(input: Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}
