import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Tx } from "../db/index.js";
import { aiCalls, aiGrants, memberships, oauthCodes } from "../db/schema.js";

/**
 * Whether AI apps may reach this dynamic at all. This is the one place the consent rule lives: today every member has
 * to have switched AI access on (a solo member's own switch is enough). Everything an AI app does goes through the
 * app's own routes as the person who connected it, so this only ever narrows what they could already do in the app.
 */
export async function aiReachable(db: Tx, relationshipId: string): Promise<boolean> {
  const [row] = await db
    .select({ total: sql<number>`count(*)::int`, allowed: sql<number>`count(*) filter (where ${memberships.aiAccess})::int` })
    .from(memberships)
    .where(eq(memberships.relationshipId, relationshipId));
  return !!row && row.total > 0 && row.allowed === row.total;
}

export const ACCESS_TTL_MS = 60 * 60 * 1000;
export const REFRESH_TTL_MS = 30 * 86_400_000;
export const CODE_TTL_MS = 5 * 60 * 1000;

export const SCOPE_USER = "fealty";
export const SCOPE_STAFF = "fealty:staff";

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = (prefix: string) => `${prefix}_${randomBytes(32).toString("base64url")}`;

/** PKCE with S256, the only method we offer. */
export const pkceMatches = (verifier: string, challenge: string) => createHash("sha256").update(verifier).digest("base64url") === challenge;

/** The live grant behind an access token, or null when it's unknown, expired or disconnected. */
export async function grantForAccessToken(db: Tx, token: string, now: Date) {
  if (!token.startsWith("fea_at_")) return null;
  const [grant] = await db
    .select()
    .from(aiGrants)
    .where(and(eq(aiGrants.accessHash, hashToken(token)), gt(aiGrants.accessExpiresAt, now), isNull(aiGrants.revokedAt)));
  return grant ?? null;
}

/** Fresh tokens for a grant; the old ones stop working at once. */
export async function rotateTokens(db: Tx, grantId: string, now: Date) {
  const access = newToken("fea_at");
  const refresh = newToken("fea_rt");
  await db
    .update(aiGrants)
    .set({
      accessHash: hashToken(access),
      accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_MS),
      refreshHash: hashToken(refresh),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
    })
    .where(eq(aiGrants.id, grantId));
  return { access, refresh };
}

const CALLS_KEPT_MS = 90 * 86_400_000;

/** Worker step: drops call logs after 90 days, used-up codes, and grants that were disconnected or ran out a month ago. */
export async function pruneAi(db: Tx, now: Date) {
  await db.delete(aiCalls).where(lt(aiCalls.createdAt, new Date(now.getTime() - CALLS_KEPT_MS)));
  await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now));
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);
  await db.delete(aiGrants).where(or(and(isNotNull(aiGrants.revokedAt), lt(aiGrants.revokedAt, monthAgo)), lt(aiGrants.refreshExpiresAt, monthAgo)));
}
