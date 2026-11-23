import { Link, useNavigate } from "@tanstack/react-router";
import { useAgreement, useBalances, useChastity, useLibrary } from "../api/hooks";
import { Avatar } from "../components/Avatar";
import { DYNAMIC, InviteButton, useSections, type Dest } from "../components/AppShell";
import { DynamicSwitcher } from "../components/DynamicSwitcher";
import { Icon, cx } from "../components/ui";
import { fmtDate, localDateOf } from "../lib/dates";
import { useMenu } from "../lib/menu";
import { useTodayOccurrences } from "../lib/today";
import { ROLE_LABEL, isCollared, useRel } from "../lib/relationship";
import { useDynamicTitle } from "./Dynamic";

/** The order Us reads in, left to right then down. Anything not named here follows. */
const ORDER = ["/rules", "/protocols", "/rewards", "/consequences", "/notes", "/journal", "/limits", "/agreement", "/scenes", "/chastity", "/location", "/stats", "/review", "/kits", "/tasks"];

function Cell({ d, count }: { d: Dest; count?: string }) {
  return (
    <li className="min-w-0">
      <Link to={d.to} className="state-layer flex h-12 items-center gap-3 border-b border-outline-variant outline-none">
        <Icon name={d.icon} size={20} className="shrink-0 text-on-surface-variant" />
        <span className="min-w-0 flex-1 truncate font-serif text-[19px] leading-7 text-on-surface">{d.label}</span>
        {count && <span className="shrink-0 text-[11px] leading-4 text-on-surface-variant">{count}</span>}
      </Link>
    </li>
  );
}

/** A small number or word beside each section, where it's cheap to know. */
function useCounts(sections: Dest[]) {
  const { rel, me, isDom } = useRel();
  const has = (to: string) => sections.some((d) => d.to === to);
  const rules = useLibrary(rel.id, "rules", has("/rules"));
  const notes = useLibrary(rel.id, "notes", has("/notes"));
  const balances = useBalances(rel.id);
  const agreement = useAgreement(rel.id, has("/agreement"));
  const chastity = useChastity(rel.id, has("/chastity"));
  const occ = useTodayOccurrences();
  // Whose points: your own, or for a dominant, the submissive's.
  const sub = isDom ? rel.members.find((m) => m.role === "submissive" && m.userId !== me.user.id) : null;
  const points = balances.data?.find((b) => b.userId === (sub?.userId ?? me.user.id))?.balance;
  const lock = chastity.data?.open[0];
  const whose = sub?.userId ?? me.user.id;
  const owed = (occ.data ?? []).filter((o) => o.consequence && o.assigneeId === whose && (o.status === "pending" || o.status === "missed")).length;
  const current = agreement.data?.current;
  return {
    "/rules": rules.data ? String(rules.data.length) : undefined,
    "/notes": notes.data ? String(notes.data.length) : undefined,
    "/rewards": points !== undefined ? `${points} pts` : undefined,
    "/consequences": owed > 0 ? `${owed} owed` : undefined,
    "/agreement": current ? `v${current.number}` : agreement.data?.proposal ? "proposed" : undefined,
    "/chastity": lock ? ({ active: "locked", break: "on a break", pending: "starting" } as Record<string, string>)[lock.status] : undefined,
  } as Record<string, string | undefined>;
}

/** Us: who's in the dynamic, then everything the Today and Week tabs don't cover, in two columns. Settings is the gear. */
export function UsPage() {
  const { rel, me } = useRel();
  const menu = useMenu();
  const navigate = useNavigate();
  const title = useDynamicTitle();
  const sections = [...useSections()].sort((a, b) => rank(a.to) - rank(b.to));
  const counts = useCounts(sections);
  const self = rel.members.find((m) => m.userId === me.user.id);
  const since = fmtDate(localDateOf(new Date(rel.createdAt)), { month: "short", year: "numeric" });
  const sub = [self && rel.members.length > 1 ? `You're the ${ROLE_LABEL[self.role]}` : rel.members.length === 1 ? "On your own" : null, `since ${since}`]
    .filter(Boolean)
    .join(" · ");
  const people = (
    <span className="flex shrink-0">
      {rel.members.slice(0, 3).map((m, i) => (
        <Avatar
          key={m.userId}
          userId={m.userId}
          name={m.displayName}
          version={m.avatarVersion ?? null}
          size={56}
          collared={isCollared(rel, m.userId)}
          className={cx("ring-2 ring-surface", i > 0 && "-ml-3")}
        />
      ))}
    </span>
  );

  return (
    <>
      <header className="flex min-h-10 items-center justify-end px-2 pt-3 md:px-4 md:pt-6">
        <h1 className="sr-only">Us</h1>
        <button
          type="button"
          aria-label="Settings"
          title="Settings"
          onClick={() => void navigate({ to: "/settings" })}
          className="state-layer inline-flex size-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant"
        >
          <GearSix />
        </button>
      </header>
      {menu?.banner}
      <div className="px-4 pb-8 md:px-6">
        <DynamicSwitcher hero={{ title, sub, people }} />
        <div className={cx("mt-4 grid gap-3", menu?.safeWord && "grid-cols-2")}>
          {menu?.safeWord && (
            <button
              type="button"
              onClick={menu.safeWord}
              className="state-layer flex h-12 items-center justify-center gap-2 rounded-md border border-primary text-label-large text-primary"
            >
              <Icon name="front_hand" size={20} />
              Safe call
            </button>
          )}
          <Link to={DYNAMIC.to} className="state-layer flex h-12 items-center justify-center gap-2 rounded-md border border-on-surface text-label-large text-on-surface">
            <Icon name="favorite" size={20} />
            {DYNAMIC.label}
          </Link>
        </div>
        <ul className="mt-4 grid grid-cols-2 gap-x-6">
          {sections.map((d) => (
            <Cell key={d.to} d={d} count={counts[d.to]} />
          ))}
        </ul>
        {menu?.invite && <InviteButton onClick={menu.invite} className="mt-3 h-12 px-0" />}
      </div>
    </>
  );
}

function rank(to: string) {
  const i = ORDER.indexOf(to);
  return i < 0 ? ORDER.length : i;
}

/** Phosphor "gear-six" (MIT), as in the mockups. */
function GearSix() {
  return (
    <svg viewBox="0 0 256 256" width={24} height={24} fill="currentColor" aria-hidden="true">
      <path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,41.85,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.15a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.62a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,214.15,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Zm-15,34.91-28.57,16.25a8,8,0,0,0-3,3c-.58,1-1.19,2.06-1.81,3.06a7.94,7.94,0,0,0-1.22,4.21l-.15,32.25a95.89,95.89,0,0,1-25.37,14.3L134,199.13a8,8,0,0,0-3.91-1h-.19c-1.21,0-2.43,0-3.64,0a8.08,8.08,0,0,0-4.1,1l-28.84,16.1A96,96,0,0,1,67.88,201l-.11-32.2a8,8,0,0,0-1.22-4.22c-.62-1-1.23-2-1.8-3.06a8.09,8.09,0,0,0-3-3.06l-28.6-16.29a90.49,90.49,0,0,1,0-28.26L61.67,97.63a8,8,0,0,0,3-3c.58-1,1.19-2.06,1.81-3.06a7.94,7.94,0,0,0,1.22-4.21l.15-32.25a95.89,95.89,0,0,1,25.37-14.3L122,56.87a8,8,0,0,0,4.1,1c1.21,0,2.43,0,3.64,0a8.08,8.08,0,0,0,4.1-1l28.84-16.1A96,96,0,0,1,188.12,55l.11,32.2a8,8,0,0,0,1.22,4.22c.62,1,1.23,2,1.8,3.06a8.09,8.09,0,0,0,3,3.06l28.6,16.29A90.49,90.49,0,0,1,222.9,142.12Z" />
    </svg>
  );
}
