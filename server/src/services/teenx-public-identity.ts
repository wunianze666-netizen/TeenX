export type TeenxPublicIdentity = {
  readonly publicId: string;
  readonly forumUsername: string;
};

export function createTeenxPublicIdentity(captainId: string, secret: string): TeenxPublicIdentity {
  const digest = createHmac("sha256", secret).update(captainId).digest("base64url");
  return {
    publicId: `captain_v1_${digest}`,
    forumUsername: `tx_${digest.slice(0, 16)}`,
  };
}
import { createHmac } from "node:crypto";
