import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { advxVersionService } from "../services/advx-versions.js";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("ADVX Arena bound Team Version numbering", () => {
  it("keeps version numbers monotonic after retaining only the latest twenty", async () => {
    const paperclipHome = await fs.mkdtemp(path.join(os.tmpdir(), "advx-arena-versions-"));
    process.env.PAPERCLIP_HOME = paperclipHome;
    process.env.PAPERCLIP_INSTANCE_ID = "arena-version-test";
    const teamId = "30000000-0000-4000-8000-000000000001";
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [{ id: teamId }] }),
        }),
      }),
    };
    const versions = advxVersionService(db as never);
    try {
      for (let versionNumber = 1; versionNumber <= 22; versionNumber += 1) {
        await versions.create(teamId, { teamName: "Arena Team", members: [], label: `Version ${versionNumber}` });
      }
      const retained = await versions.list(teamId);
      expect(retained).toHaveLength(20);
      expect(retained.map((version) => version.versionNumber)).toEqual(Array.from({ length: 20 }, (_, index) => 22 - index));
    } finally {
      await fs.rm(paperclipHome, { recursive: true, force: true });
    }
  });
});
