import { describe, expect, it, vi } from "vitest";
import { runDemoPreparation } from "./demo-preparation";

describe("demo preparation", () => {
  it("prepares the team before the Arena result", async () => {
    const calls: string[] = [];
    const client = {
      bootstrapDemo: vi.fn(async () => { calls.push("bootstrap"); }),
      prepareDemoArena: vi.fn(async () => { calls.push("prepare-arena"); }),
    };

    await runDemoPreparation(client, (stage) => calls.push(stage));

    expect(calls).toEqual(["team", "bootstrap", "arena", "prepare-arena", "ready"]);
  });

  it("stops before Arena when team preparation fails", async () => {
    const prepareDemoArena = vi.fn(async () => undefined);
    const client = {
      bootstrapDemo: vi.fn(async () => { throw new Error("offline"); }),
      prepareDemoArena,
    };

    await expect(runDemoPreparation(client, () => undefined)).rejects.toThrow("offline");
    expect(prepareDemoArena).not.toHaveBeenCalled();
  });
});
