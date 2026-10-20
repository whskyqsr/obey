import type { FastifyRequest } from "fastify";
import { eq, getTableColumns } from "drizzle-orm";
import type { App as FirebaseApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import type { Db } from "./db/index.js";
import { users } from "./db/schema.js";
import { HttpError } from "./errors.js";

export interface Identity {
  uid: string;
  displayName: string;
  email: string | null;
  /** The email only when the provider vouches for it; admin rights hang on this, never on a typed address. */
  verifiedEmail: string | null;
  /** An email-and-password account that hasn't confirmed its address yet; only a few routes accept it. */
  unverified?: boolean;
}

/** Turns a request into the caller's identity, or throws 401. */
export type Authenticator = (req: FastifyRequest) => Promise<Identity>;

/** New accounts show only a first name; people can change it later with PATCH /me. */
export function initialDisplayName(fullName: string | undefined, email: string | undefined): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return (first || email?.split("@")[0] || "Partner").slice(0, 40);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAuthenticator(opts: { devAuth: boolean; firebase: FirebaseApp | null }): Authenticator {
  return async (req) => {
    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ") && opts.firebase) {
      let token: Awaited<ReturnType<ReturnType<typeof getAuth>["verifyIdToken"]>>;
      try {
        token = await getAuth(opts.firebase).verifyIdToken(header.slice(7));
      } catch {
        throw new HttpError(401, "invalid token");
      }
      return {
        uid: `firebase:${token.uid}`,
        displayName: initialDisplayName(token.name as string | undefined, token.email),
        email: token.email ?? null,
        verifiedEmail: token.email && token.email_verified === true ? token.email : null,
        // Email-and-password sign-ups must confirm their address before using the app; Google vouches for its own.
        unverified: token.firebase?.sign_in_provider === "password" && token.email_verified !== true,
      };
    }
    const dev = req.headers["x-dev-user"];
    if (opts.devAuth && typeof dev === "string" && UUID.test(dev)) {
      const name = req.headers["x-dev-name"];
      const email = req.headers["x-dev-email"];
      const unverified = req.headers["x-dev-unverified"] === "1";
      return {
        uid: `dev:${dev.toLowerCase()}`,
        displayName: typeof name === "string" ? name : `Dev ${dev.slice(0, 4)}`,
        email: typeof email === "string" ? email : null,
        verifiedEmail: typeof email === "string" && !unverified ? email : null,
        unverified,
      };
    }
    throw new HttpError(401, "sign in required");
  };
}

// Every column but the avatar bytes, which every request would otherwise load.
const { avatar: _avatar, ...userColumns } = getTableColumns(users);

/** Finds or creates the user row for an identity. */
export async function upsertUser(db: Db, identity: Identity) {
  const [existing] = await db.select(userColumns).from(users).where(eq(users.authUid, identity.uid));
  if (existing) return existing;
  const [created] = await db.insert(users).values({ authUid: identity.uid, displayName: identity.displayName, email: identity.email }).onConflictDoNothing().returning(userColumns);
  if (created) return created;
  const [raced] = await db.select(userColumns).from(users).where(eq(users.authUid, identity.uid));
  return raced!;
}
