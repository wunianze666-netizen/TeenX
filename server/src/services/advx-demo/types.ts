import { z } from "zod";
import type { PublicArenaScore } from "../advx-arena/public-types.js";
import type { ArenaStandard, ParsedSubmission } from "../advx-arena/types.js";

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const relativeAssetPathSchema = z.string().min(1).max(200).regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9._/-]+$/);
const evidenceSchema = z.object({
  path: z.string().min(1),
  lineStart: z.number().int().positive(),
  lineEnd: z.number().int().positive(),
  quote: z.string().min(1),
  verified: z.literal(true),
}).strict();
const subScoreSchema = z.object({
  name: z.string().min(1), score: z.number().int().nonnegative(), maxScore: z.number().int().positive(),
  comment: z.string(), anchor: z.enum(["zero", "partial", "full"]),
  confidence: z.enum(["high", "medium", "low"]),
  verification: z.enum(["source_verified", "static_inference", "not_verifiable"]),
  evidence: z.array(evidenceSchema), evidenceWarnings: z.array(z.string()),
}).strict();
const dimensionSchema = z.object({
  name: z.string().min(1), score: z.number().int().nonnegative(), maxScore: z.number().int().positive(),
  comment: z.string(), subScores: z.array(subScoreSchema).min(1),
  review: z.object({
    primaryScore: z.number().int().nonnegative(), independentScore: z.number().int().nonnegative(),
    delta: z.number().int().nonnegative(), adjudicated: z.literal(true),
  }).strict(),
}).strict();

export const publicArenaScoreSchema = z.object({
  id: z.string().min(1), submissionId: z.string().min(1), challengeVersionId: z.string().min(1),
  teamVersionId: z.string().min(1), submissionSha256: sha256Schema,
  rubricVersion: z.literal("arena-rubric-v3"), official: z.boolean(),
  totalScore: z.number().int().nonnegative(), totalMaxScore: z.literal(1000), summary: z.string(),
  strengths: z.array(z.string()), weaknesses: z.array(z.string()), dimensions: z.array(dimensionSchema),
  scoredAt: z.string().datetime(),
}).strict();

const subCriterionSchema = z.object({
  name: z.string().min(1), maxScore: z.number().int().positive(), anchor0: z.string().min(1),
  anchorPartial: z.string().min(1), anchorFull: z.string().min(1),
}).strict();
const criterionSchema = z.object({
  name: z.string().min(1), maxScore: z.number().int().positive(), rubric: z.string().min(1),
  subCriteria: z.array(subCriterionSchema).min(1),
}).strict();
const provenanceSchema = z.object({
  mode: z.enum(["mock", "official"]), model: z.string().min(1), policy: z.literal("deepseek-fixed-v1"),
}).strict();

export const arenaStandardSchema = z.object({
  id: z.string().min(1), challengeVersionId: z.string().min(1), criteria: z.array(criterionSchema),
  totalMaxScore: z.number().int().positive(), rubricVersion: z.literal("arena-rubric-v3"),
  generatedAt: z.string().datetime(), challengeDigest: sha256Schema, provenance: provenanceSchema,
}).strict();

const assetSchema = z.object({
  path: relativeAssetPathSchema, byteSize: z.number().int().nonnegative(), sha256: sha256Schema,
}).strict();

export const todoDemoManifestSchema = z.object({
  schemaVersion: z.literal(1), fixtureId: z.literal("todo-web-v1-r1"), revision: z.literal("r1"),
  challengeVersionId: z.string().min(1), official: z.boolean(), studioGenerated: z.boolean(),
  archive: z.object({
    path: relativeAssetPathSchema, byteSize: z.number().int().positive(), sha256: sha256Schema,
    entryOrder: z.array(z.string().min(1)), modifiedAt: z.string().datetime(), unixMode: z.literal("100644"),
    compression: z.literal("deflate-raw-level-9"),
  }).strict(),
  prepared: z.object({
    standard: relativeAssetPathSchema, score: relativeAssetPathSchema,
    providerReplay: relativeAssetPathSchema, evidenceMatrix: relativeAssetPathSchema,
  }).strict(),
  assets: z.array(assetSchema).min(1),
}).strict();

export const todoDemoProviderReplaySchema = z.object({
  schemaVersion: z.literal(1), kind: z.literal("verified-prepared-score"),
  challengeVersionId: z.string().min(1), revision: z.literal("r1"),
  official: z.boolean(), studioGenerated: z.boolean(), archiveAsset: relativeAssetPathSchema,
  standardAsset: relativeAssetPathSchema, scoreAsset: relativeAssetPathSchema, provenance: provenanceSchema,
}).strict();

type DeepReadonly<Value> = Value extends readonly (infer Item)[]
  ? readonly DeepReadonly<Item>[]
  : Value extends object ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> } : Value;

export type TodoDemoManifest = DeepReadonly<z.infer<typeof todoDemoManifestSchema>>;
export type TodoDemoProviderReplay = DeepReadonly<z.infer<typeof todoDemoProviderReplaySchema>>;
export type TodoDemoFixture = {
  readonly manifest: TodoDemoManifest;
  readonly archive: Buffer;
  readonly archiveSha256: string;
  readonly parsedSubmission: ParsedSubmission;
  readonly standard: ArenaStandard;
  readonly score: PublicArenaScore;
  readonly providerReplay: TodoDemoProviderReplay;
};

export class TodoDemoFixtureIntegrityError extends Error {
  readonly name = "TodoDemoFixtureIntegrityError";

  constructor(readonly reason: string, options?: ErrorOptions) {
    super(`ADVX Todo demo fixture integrity failure: ${reason}`, options);
  }
}
