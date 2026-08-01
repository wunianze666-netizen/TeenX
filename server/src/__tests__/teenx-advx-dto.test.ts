import { describe, expect, it } from "vitest";
import {
  toTeenxActivityView,
  toTeenxTeamView,
  toTeenxTestRunView,
  toTeenxVersionView,
} from "../services/teenx-advx-dto.js";

const FORBIDDEN = /actorId|agentId|companyId|issueId|teamId|resultJson|metadata|model|provider|cost|budget|credit|spend|token|prompt|log|raw/i;

describe("TeenX existing ADVX DTO projectors", () => {
  it("projects Team fields without model or internal metadata", () => {
    // Given: a Company-shaped Team object containing operator fields.
    const input = {
      id: "team-resource-id",
      name: "安全队伍",
      description: "一起创造",
      status: "active",
      memberCount: 4,
      versionCount: 2,
      model: { id: "deepseek", provider: "private-provider" },
      budgetMonthlyCents: 100,
      metadata: { prompt: "private" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    };

    // When: it is projected for the child API.
    const output = toTeenxTeamView(input);

    // Then: only self-service Team fields remain.
    expect(output).toEqual({
      id: "team-resource-id",
      name: "安全队伍",
      description: "一起创造",
      status: "active",
      memberCount: 4,
      versionCount: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
    expect(JSON.stringify(output)).not.toMatch(FORBIDDEN);
  });

  it("projects activity without raw IDs or arbitrary details", () => {
    // Given: a raw activity row carrying identities and nested private data.
    const input = {
      id: "activity-id",
      companyId: "team-id",
      actorId: "raw-user-id",
      agentId: "agent-id",
      runId: "run-id",
      responsibleUserId: "raw-user-id",
      action: "agent.updated",
      entityType: "agent",
      entityId: "agent-id",
      details: { prompt: "secret", model: "deepseek", arbitrary: { token: 42 } },
      createdAt: new Date("2026-07-25T00:00:00.000Z"),
    };

    // When: it is projected for the child timeline.
    const output = toTeenxActivityView(input);

    // Then: only the action classification and timestamp remain.
    expect(output).toEqual({ action: "agent.updated", entityType: "agent", createdAt: "2026-07-25T00:00:00.000Z" });
    expect(JSON.stringify(output)).not.toMatch(FORBIDDEN);
  });

  it("projects a test run without result JSON, agent data, raw activity, or work-product metadata", () => {
    // Given: a raw run aggregate with every sensitive nested field populated.
    const input = {
      run: {
        id: "run-id",
        issueId: "issue-id",
        agentId: "agent-id",
        status: "completed",
        startedAt: new Date("2026-07-25T00:00:00.000Z"),
        finishedAt: new Date("2026-07-25T00:01:00.000Z"),
        resultSummary: "完成",
        resultJson: { prompt: "private", tokenUsage: 10 },
      },
      activity: [{ action: "issue.created", entityType: "issue", actorId: "raw-user-id", details: { model: "x" }, createdAt: new Date("2026-07-25T00:00:00.000Z") }],
      products: [{ id: "product-id", title: "产物", type: "artifact", summary: "摘要", provider: "local", metadata: { log: "secret" }, url: "file:///private" }],
    };

    // When: the aggregate is projected for the result page.
    const output = toTeenxTestRunView(input);

    // Then: the response is an allowlist rather than a recursively stripped raw object.
    expect(output).toEqual({
      status: "completed",
      startedAt: "2026-07-25T00:00:00.000Z",
      finishedAt: "2026-07-25T00:01:00.000Z",
      resultSummary: "完成",
      activity: [{ action: "issue.created", entityType: "issue", createdAt: "2026-07-25T00:00:00.000Z" }],
      products: [{ title: "产物", type: "artifact", summary: "摘要" }],
    });
    expect(JSON.stringify(output)).not.toMatch(FORBIDDEN);
  });

  it("removes Team and member IDs from persisted version snapshots", () => {
    // Given: an internal version snapshot.
    const input = {
      id: "version-resource-id",
      teamId: "team-id",
      versionNumber: 1,
      label: "v1",
      createdAt: "2026-07-25T00:00:00.000Z",
      snapshot: {
        teamName: "安全队伍",
        members: [{ id: "agent-id", name: "小雷达", roleTemplate: "scout", responsibilities: "调查", tools: ["search"], skills: [] }],
      },
    };

    // When: the snapshot is projected.
    const output = toTeenxVersionView(input);

    // Then: resource linkage stays server-side.
    expect(output).toEqual({
      id: "version-resource-id",
      versionNumber: 1,
      label: "v1",
      createdAt: "2026-07-25T00:00:00.000Z",
      snapshot: {
        teamName: "安全队伍",
        members: [{ name: "小雷达", roleTemplate: "scout", responsibilities: "调查", tools: ["search"], skills: [] }],
      },
    });
    expect(JSON.stringify(output)).not.toMatch(/teamId|agent-id/);
  });
});
