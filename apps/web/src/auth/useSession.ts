import { useEffect, useState } from "react";
import { type Session, getSession, onSession } from "./session";

/** `undefined` while the auth state is loading, `null` when signed out. */
export function useSession(): Session | null | undefined {
  const [s, setS] = useState(getSession);
  useEffect(() => onSession(setS), []);
  return s;
}
