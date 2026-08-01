import { createTeenxPublicIdentity } from "./teenx-public-identity.js";

export class TeenxPublicDirectoryCapacityError extends Error {
  readonly name = "TeenxPublicDirectoryCapacityError";

  constructor() {
    super("TeenX public directory scan capacity exceeded");
  }
}

export type EligibleCaptain = {
  readonly captainId: string;
  readonly teamId: string;
  readonly teamName: string;
  readonly teamCreatedAt: Date;
};

export type TeenxPublicDirectory = {
  resolve(publicId: string): Promise<EligibleCaptain | null>;
};

export function createTeenxPublicDirectory(_input: {
  readonly secret: string;
  readonly scanCap: number;
  readonly cacheTtlMs: number;
  readonly now?: () => number;
  readonly loadEligibleCaptains: (limit: number) => Promise<readonly EligibleCaptain[]>;
}): TeenxPublicDirectory {
  const input = _input;
  const now = input.now ?? Date.now;
  let expiresAt = 0;
  let cache = new Map<string, EligibleCaptain | null>();
  let cachedFailure: Error | null = null;
  let inFlight: Promise<Map<string, EligibleCaptain | null>> | null = null;

  const scan = async (): Promise<Map<string, EligibleCaptain | null>> => {
    const captains = await input.loadEligibleCaptains(input.scanCap + 1);
    if (captains.length > input.scanCap) {
      throw new TeenxPublicDirectoryCapacityError();
    }
    const next = new Map<string, EligibleCaptain | null>();
    for (const captain of captains) {
      const publicId = createTeenxPublicIdentity(captain.captainId, input.secret).publicId;
      next.set(publicId, next.has(publicId) ? null : captain);
    }
    cache = next;
    cachedFailure = null;
    expiresAt = now() + input.cacheTtlMs;
    return next;
  };

  const current = async (): Promise<Map<string, EligibleCaptain | null>> => {
    if (now() < expiresAt) {
      if (cachedFailure) throw cachedFailure;
      return cache;
    }
    if (inFlight) return inFlight;
    inFlight = scan()
      .catch((error) => {
        if (error instanceof Error) {
          cachedFailure = error;
          expiresAt = now() + input.cacheTtlMs;
        }
        throw error;
      })
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  };

  return {
    resolve: async (publicId) => (await current()).get(publicId) ?? null,
  };
}
