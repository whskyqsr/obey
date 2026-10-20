import type { ReactNode } from "react";
import { Avatar } from "./Avatar";
import { cx } from "./ui";

export interface HeroPerson {
  userId: string;
  displayName: string;
  avatarVersion: string | null;
  collared?: boolean;
}

/** The people in a dynamic as overlapping avatars, with a title and a line under it. */
export function DynamicHero({ people, title, sub, size = 64, className }: { people: HeroPerson[]; title: ReactNode; sub?: ReactNode; size?: number; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center gap-3 text-center", className)}>
      <div className="flex">
        {people.slice(0, 4).map((p, i) => (
          // The ring sits on the avatar itself (an inline wrapper followed the text baseline); a collared sub sits on top so the badge shows.
          <Avatar
            key={p.userId}
            userId={p.userId}
            name={p.displayName}
            version={p.avatarVersion}
            size={size}
            collared={p.collared}
            className={cx("ring-4 ring-surface", i > 0 && "-ml-3", p.collared && "z-10")}
          />
        ))}
      </div>
      <div>
        <div className="text-headline-small text-on-surface">{title}</div>
        {sub && <div className="mt-1 text-body-medium text-on-surface-variant">{sub}</div>}
      </div>
    </div>
  );
}
