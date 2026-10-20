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
      try {
        const token = await getAuth(opts.firebase).verifyIdToken(header.slice(7));
        return {
          uid: `firebase:${token.uid}`,
          displayName: initialDisplayName(token.name as string | undefined, token.email),
          email: token.email ?? null,
        };
      } catch {
        throw new HttpError(401, "invalid token");
      }
    }
    const dev = req.headers["x-dev-user"];
    if (opts.devAuth && typeof dev === "string" && UUID.test(dev)) {
      const name = req.headers["x-dev-name"];
      return { uid: `dev:${dev.toLowerCase()}`, displayName: typeof name === "string" ? name : `Dev ${dev.slice(0, 4)}`, email: null };
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
