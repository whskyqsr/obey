import { Link, useNavigate } from "@tanstack/react-router";
import { useAgreement, useBalances, useChastity, useLibrary } from "../api/hooks";
import { Avatar } from "../components/Avatar";
import { DYNAMIC, InviteButton, useSections, type Dest } from "../components/AppShell";
import { DynamicSwitcher } from "../components/DynamicSwitcher";
import { IconButton, Icon, cx } from "../components/ui";
import { fmtDate, localDateOf } from "../lib/dates";
import { useMenu } from "../lib/menu";
import { ROLE_LABEL, isCollared, useRel } from "../lib/relationship";
import { useDynamicTitle } from "./Dynamic";

/** The order Us reads in, left to right then down. Anything not named here follows. */
const ORDER = ["/rules", "/protocols", "/rewards", "/consequences", "/notes", "/journal", "/limits", "/agreement", "/scenes", "/chastity", "/location", "/stats", "/review", "/kits", "/tasks"];

function Cell({ d, count }: { d: Dest; count?: string }) {
  return (
    <li className="min-w-0">
      <Link to={d.to} className="state-layer flex h-12 items-center gap-3 border-b border-outline-variant outline-none">
        <Icon name={d.icon} size={20} className="shrink-0 text-on-surface-variant" />
        <span className="min-w-0 flex-1 truncate font-serif text-[21px] leading-7 text-on-surface">{d.label}</span>
        {count && <span className="shrink-0 text-body-small text-on-surface-variant">{count}</span>}
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
  // Whose points: your own, or for a dominant, the submissive's.
  const sub = isDom ? rel.members.find((m) => m.role === "submissive" && m.userId !== me.user.id) : null;
  const points = balances.data?.find((b) => b.userId === (sub?.userId ?? me.user.id))?.balance;
  const lock = chastity.data?.open[0];
  const current = agreement.data?.current;
  return {
    "/rules": rules.data ? String(rules.data.length) : undefined,
    "/notes": notes.data ? String(notes.data.length) : undefined,
    "/rewards": points !== undefined ? `${points} pts` : undefined,
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
        <IconButton icon="settings" label="Settings" onClick={() => void navigate({ to: "/settings" })} />
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
