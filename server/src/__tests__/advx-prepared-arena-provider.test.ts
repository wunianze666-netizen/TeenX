import { describe, expect, it } from "vitest";
import { getArenaChallenge } from "../services/advx-arena-catalog.js";
import { generateArenaStandard } from "../services/advx-arena/standard-generator.js";
import {
  createPreparedArenaProvider,
  PreparedArenaProviderError,
} from "../services/advx-demo/prepared-arena-provider.js";
import {
  TODO_DEMO_CHALLENGE_VERSION_ID,
  TODO_DEMO_SUBMISSION_SHA256,
} from "../services/advx-demo/fixture.js";

describe("ADVX prepared Arena provider dispatch", () => {
  it("is intrinsically bound to the verified r1 challenge and archive", async () => {
    // Given: the dedicated deterministic provider.
    const provider = await createPreparedArenaProvider();

    // When: its immutable binding and provenance are inspected.
    // Then: it is non-official and identifies the exact committed fixture.
    expect(provider.binding).toEqual({
      profile: "prepared_demo",
      fixtureId: "todo-web-v1-r1",
      revision: "r1",
      challengeVersionId: TODO_DEMO_CHALLENGE_VERSION_ID,
      submissionSha256: TODO_DEMO_SUBMISSION_SHA256,
    });
    expect(provider.official).toBe(false);
    expect(provider.provenance).toEqual({
      mode: "prepared_demo",
      model: "demo-deterministic",
      policy: "deepseek-fixed-v1",
    });
  });

  it.each([
    { label: "standard.repair", prompt: "TASK:REPAIR_STANDARD", reason: "repair_path" },
    { label: "unknown.label", prompt: "TASK:UNKNOWN", reason: "unknown_call" },
    {
      label: "score.primary.需求符合度",
      prompt: "TASK:SCORE_DIMENSION\n<criterion_json>{}</criterion_json>",
      reason: "prompt_identity",
    },
  ])("fails closed for $reason dispatch", async ({ label, prompt, reason }) => {
    // Given: a fresh prepared provider.
    const provider = await createPreparedArenaProvider();

    // When: a repair, unknown, or identity-mismatched call is requested.
    const call = provider.call(prompt, { label, maxTokens: 100 });

    // Then: no fallback response is supplied.
    await expect(call).rejects.toMatchObject({ reason });
  });

  it("rejects a duplicate valid lifecycle call", async () => {
    // Given: one valid standard generation has consumed its response.
    const provider = await createPreparedArenaProvider();
    const challenge = getArenaChallenge(TODO_DEMO_CHALLENGE_VERSION_ID);
    const provenance = provider.provenance;
    if (!challenge || !provenance) throw new TypeError("prepared Arena identities unavailable");
    await generateArenaStandard(challenge, provider.call.bind(provider), provenance);

    // When: the evaluator requests the same response again.
    const duplicate = generateArenaStandard(challenge, provider.call.bind(provider), provenance);

    // Then: replay is rejected rather than silently reused.
    await expect(duplicate).rejects.toBeInstanceOf(PreparedArenaProviderError);
    await expect(duplicate).rejects.toMatchObject({ reason: "duplicate_call" });
  });
});
