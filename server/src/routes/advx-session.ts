import { Router } from "express";
import { sendTeenxChildApiDenied } from "../middleware/teenx-child-api-boundary.js";

export type AdvxSession =
  | { readonly authenticated: false }
  | {
    readonly authenticated: true;
    readonly authMode: "signed_in" | "local_demo";
    readonly captain: { readonly nickname: string | null };
  };

export function advxSessionRoutes() {
  const router = Router();

  router.get("/session", (request, response) => {
    if (request.actor.type === "none" && request.actor.source === "none") {
      response.json({ authenticated: false } satisfies AdvxSession);
      return;
    }

    const nickname = request.actor.userName?.trim() || null;
    if (
      request.actor.type === "board" &&
      request.actor.source === "session" &&
      request.actor.userId &&
      request.actor.sessionId
    ) {
      response.json({
        authenticated: true,
        authMode: "signed_in",
        captain: { nickname },
      } satisfies AdvxSession);
      return;
    }
    if (
      request.actor.type === "board" &&
      request.actor.source === "local_implicit" &&
      request.actor.userId
    ) {
      response.json({
        authenticated: true,
        authMode: "local_demo",
        captain: { nickname },
      } satisfies AdvxSession);
      return;
    }
    sendTeenxChildApiDenied(response);
  });

  return router;
}
