import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { allFeatures } from "@obey/contracts";
import type { Features, Me, Member, Relationship } from "../api/types";
import { storage } from "./storage";

const KEY = "obey.relationship";

interface RelState {
  me: Me;
  rel: Relationship;
  /** The signed-in user's membership in `rel`. */
  self: Member | undefined;
  /** Dominants (and switches) manage tasks, libraries and approvals. */
  isDom: boolean;
  partners: Member[];
  /** The relationship's name, or the partners' names when it has none. */
  title: string;
  /** Which optional parts of the app this dynamic uses. */
  features: Features;
  memberName(userId: string | null | undefined): string;
  select(id: string): void;
}

const RelContext = createContext<RelState | null>(null);

export function RelationshipProvider({ me, children }: { me: Me; children: ReactNode }) {
  const [selected, setSelected] = useState(() => storage.get(KEY));
  const value = useMemo<RelState | null>(() => {
    const rel = me.relationships.find((r) => r.id === selected) ?? me.relationships[0];
    if (!rel) return null;
    const self = rel.members.find((m) => m.userId === me.user.id);
    return {
      me,
      rel,
      self,
      isDom: self ? self.role !== "submissive" : false,
      partners: rel.members.filter((m) => m.userId !== me.user.id),
      title: relTitle(rel, me.user.id),
      features: allFeatures(rel.features),
      memberName(userId) {
        if (!userId) return "Someone";
        if (userId === me.user.id) return "You";
        return rel.members.find((m) => m.userId === userId)?.displayName ?? "Former member";
      },
      select(id) {
        storage.set(KEY, id);
        setSelected(id);
      },
    };
  }, [me, selected]);
  if (!value) return <>{children}</>;
  return <RelContext.Provider value={value}>{children}</RelContext.Provider>;
}

export function useRel(): RelState {
  const ctx = useContext(RelContext);
  if (!ctx) throw new Error("useRel needs a relationship");
  return ctx;
}

export function useOptionalRel(): RelState | null {
  return useContext(RelContext);
}

/** "Us", or "Kitten", or "Kitten & Pet", or a nudge to invite someone. */
export function relTitle(rel: Relationship, myId: string): string {
  if (rel.name) return rel.name;
  const names = rel.members.filter((m) => m.userId !== myId).map((m) => m.displayName);
  if (names.length === 0) return "Waiting for your partner";
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

export const ROLE_LABEL = { dominant: "Dominant", submissive: "Submissive", switch: "Switch" } as const;
