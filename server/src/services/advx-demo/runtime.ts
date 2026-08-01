import type { Db } from "@paperclipai/db";
import type { StorageService } from "../../storage/types.js";
import { ArenaModelError, type ArenaModelProvider } from "../advx-arena/model-provider.js";
import { advxArenaRunService } from "../advx-arena/run-service.js";
import { createPreparedArenaProvider } from "./prepared-arena-provider.js";
import type { AdvxServerProfile } from "./profile.js";

function preparedReplayProvider(): ArenaModelProvider {
  return {
    available: false,
    official: false,
    contextWindow: 128_000,
    unavailableReason: "prepared_replay_only",
    provenance: null,
    async call() {
      throw new ArenaModelError("ARENA_MODEL_UNAVAILABLE", "评审服务在回放模式下不可用");
    },
  };
}

function assertNever(profile: never): never {
  throw new TypeError(`Unsupported ADVX server profile: ${String(profile)}`);
}

export async function createProfiledArenaRuntime(
  db: Db,
  storage: StorageService,
  profile: AdvxServerProfile,
) {
  switch (profile) {
    case "real":
      return advxArenaRunService(db, storage);
    case "prepared_demo":
      return advxArenaRunService(db, storage, { provider: await createPreparedArenaProvider() });
    case "prepared_replay":
      return advxArenaRunService(db, storage, { provider: preparedReplayProvider() });
    default:
      return assertNever(profile);
  }
}
