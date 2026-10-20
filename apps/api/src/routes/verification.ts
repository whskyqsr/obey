import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { HttpError } from "../errors.js";

const RESEND_GAP_MS = 60_000;

/** Our own branded verification email, so it comes from the app's domain with DKIM instead of firebaseapp.com. */
export const verificationRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const lastSent = new Map<string, number>();

  app.post("/me/verification-email", { config: { allowUnverified: true } }, async (req) => {
    // Clients fall back to Firebase's own email when we can't send.
    if (!deps.sendVerification || !req.email) return { sent: false };
    const now = deps.now().getTime();
    const last = lastSent.get(req.user.id);
    if (last && now - last < RESEND_GAP_MS) throw new HttpError(429, "We just sent one. Wait a minute before asking for another.");
    lastSent.set(req.user.id, now);
    try {
      await deps.sendVerification(req.email);
    } catch (e) {
      lastSent.delete(req.user.id);
      req.log.error(e, "verification email failed");
      return { sent: false };
    }
    return { sent: true };
  });
};
