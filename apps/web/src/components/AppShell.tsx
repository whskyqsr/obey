import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { Features } from "../api/types";
import { MenuContext, type Menu } from "../lib/menu";
import { useRel } from "../lib/relationship";
import { useNeedsYou } from "../lib/today";
import { DynamicSwitcher } from "./DynamicSwitcher";
import { InviteSheet } from "../pages/Dynamic";
import { SafeCallBanner, SafeWordSheet } from "./SafeCall";
import { Dialog, Icon, cx } from "./ui";

export interface Dest {
  to: string;
  label: string;
  icon: string;
  /** One line on the Us page. */
  hint?: string;
  /** Hidden when the dynamic switches this feature off. */
  feature?: keyof Features;
}

/** The phone's three tabs. Week is the calendar; Us lists everything else. */
const TODAY: Dest = { to: "/", label: "Today", icon: "today" };
const WEEK: Dest = { to: "/calendar", label: "Week", icon: "calendar_month" };
const US: Dest = { to: "/us", label: "Us", icon: "favorite" };

/** Everything the tabs don't cover, in the order Us and the desktop sidebar list them. Protocols live inside Rules. */
const SECTIONS: Dest[] = [
  { to: "/rewards", label: "Rewards", icon: "redeem", hint: "Points and what they buy", feature: "points" },
  { to: "/consequences", label: "Consequences", icon: "bolt", hint: "What's owed, and the list", feature: "consequences" },
  { to: "/rules", label: "Rules", icon: "gavel", hint: "Rules and protocols", feature: "rules" },
  { to: "/notes", label: "Notes", icon: "sticky_note_2", hint: "Shared and private notes" },
  { to: "/journal", label: "Journal", icon: "auto_stories", hint: "Entries and replies", feature: "journal" },
  { to: "/limits", label: "Limits", icon: "tune", hint: "Yes, no and maybe", feature: "limits" },
  { to: "/agreement", label: "Agreement", icon: "handshake", hint: "What you've agreed to", feature: "agreement" },
  { to: "/scenes", label: "Scenes", icon: "auto_awesome", hint: "Scenes and aftercare", feature: "scenes" },
  { to: "/chastity", label: "Chastity", icon: "lock", feature: "chastity" },
  { to: "/location", label: "Location", icon: "location_on", hint: "Places and curfew", feature: "location" },
  { to: "/stats", label: "Stats", icon: "insights", hint: "How the weeks are going", feature: "stats" },
  { to: "/review", label: "Monthly review", icon: "flag", hint: "Look back together", feature: "review" },
  { to: "/kits", label: "Kits", icon: "widgets", hint: "Sets of tasks, rules and rewards" },
  { to: "/tasks", label: "All tasks", icon: "checklist", hint: "Every task, paused ones too" },
];

const PROTOCOLS: Dest = { to: "/protocols", label: "Protocols", icon: "fact_check", hint: "How things are done", feature: "protocols" };

/** Your dynamic and Settings: not sections, so they sit at the bottom of Us and the sidebar. */
export const DYNAMIC: Dest = { to: "/dynamic", label: "Your dynamic", icon: "favorite", hint: "People, dates, invites, how it works" };
export const SETTINGS: Dest = { to: "/settings", label: "Settings", icon: "settings" };

/** What needs a second person, so it stays out of the way while someone is on their own. */
const NOT_SOLO = ["/agreement", "/chastity"];

/** Pages that count as part of Us on the phone: the tab stays marked and the header leads back to Us. */
const UNDER_US: string[] = [...SECTIONS.map((d) => d.to), "/protocols", "/rule-log", DYNAMIC.to, SETTINGS.to, "/places", "/curfew", "/aftercare"];

/** The sections for the current dynamic. */
export function useSections() {
  const { features, solo } = useRel();
  return SECTIONS.flatMap((d) => {
    // Protocols are a tab inside Rules; with rules off they take Rules' place.
    if (d.to === "/rules" && !features.rules && features.protocols) return [PROTOCOLS];
    return (!d.feature || features[d.feature]) && !(solo && NOT_SOLO.includes(d.to)) ? [d] : [];
  });
}

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

/** Which tab a page belongs to, or null for a page opened from one (a task, a note, an editor). */
function tabFor(pathname: string, sections: Dest[]): Dest | null {
  if (pathname === "/") return TODAY;
  if (pathname === WEEK.to) return WEEK;
  if (pathname === US.to) return US;
  // Section pages and their own lists keep the bar, with Us marked; deeper pages ("/notes/abc") have their own back arrow.
  if (UNDER_US.includes(pathname) || sections.some((d) => d.to === pathname)) return US;
  return null;
}

/** The diamond that marks where you are. */
function Marker({ className }: { className?: string }) {
  return <span aria-hidden className={cx("size-1.5 rotate-45 bg-primary", className)} />;
}

/** A phone tab: a word in the serif, the current one in ink with a diamond above it. */
function Tab({ d, active, badge }: { d: Dest; active: boolean; badge?: number }) {
  return (
    <Link
      to={d.to}
      aria-current={active ? "page" : undefined}
      className={cx("relative flex h-full items-center justify-center font-serif text-[22px] outline-none", active ? "text-on-surface" : "text-outline")}
    >
      {active && <Marker className="absolute top-2 left-1/2 -translate-x-1/2" />}
      {d.label}
      {!!badge && (
        <span className="absolute top-3 -right-3.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 font-sans text-label-small text-on-primary">{badge}</span>
      )}
    </Link>
  );
}

/** What the + button can start. Each one opens where it's made, with its form already open where the page has one. */
function useNewItems() {
  const { isDom, features, solo, rel } = useRel();
  const items: { label: string; icon: string; hint: string; go: { to: string; params?: Record<string, string>; search?: Record<string, string> } }[] = [];
  if (rel.endedAt) return items;
  if (isDom) items.push({ label: "Task", icon: "add_task", hint: "Something to do, once or on a schedule", go: { to: "/tasks/$taskId", params: { taskId: "new" } } });
  items.push({ label: "Plan", icon: "event", hint: "Something on the calendar", go: { to: "/calendar", search: { new: "1" } } });
  if (features.journal) items.push({ label: "Journal entry", icon: "auto_stories", hint: "Write tonight's entry", go: { to: "/journal/$noteId", params: { noteId: "new" } } });
  items.push({ label: "Note", icon: "sticky_note_2", hint: "Shared or just for you", go: { to: "/notes/$noteId", params: { noteId: "new" } } });
  if (features.rules)
    items.push({ label: isDom ? "Broken rule" : "Own up to a rule", icon: "gavel", hint: isDom ? "Log it, with a consequence if you like" : "Tell them before they find out", go: { to: "/rule-log", search: { new: "1" } } });
  if (features.consequences && isDom) items.push({ label: "Consequence", icon: "bolt", hint: "Hand one out now", go: { to: "/consequences" } });
  if (features.scenes && !solo) items.push({ label: "Scene", icon: "auto_awesome", hint: "Log it, then each of you writes your side", go: { to: "/scenes", search: { new: "1" } } });
  if (isDom) items.push({ label: "From a kit", icon: "widgets", hint: "Add a set of tasks, rules and rewards", go: { to: "/kits" } });
  return items;
}

function NewSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const items = useNewItems();
  const navigate = useNavigate();
  return (
    <Dialog open={open} onClose={onClose} title="New">
      <ul className="-mx-2 flex flex-col">
        {items.map((it) => (
          <li key={it.label}>
            <button
              type="button"
              onClick={() => {
                onClose();
                void navigate(it.go as never);
              }}
              className="state-layer flex w-full items-center gap-4 rounded-md px-2 py-3 text-left"
            >
              <Icon name={it.icon} className="text-on-surface" />
              <span className="min-w-0 flex-1">
                <span className="block font-serif text-[20px] leading-6 text-on-surface">{it.label}</span>
                <span className="block text-body-small text-on-surface-variant">{it.hint}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** A sidebar row: icon and label in the serif, the current one in ink with the diamond, and an optional count. */
function SideItem({ d, active, badge }: { d: Dest; active: boolean; badge?: number }) {
  return (
    <Link
      to={d.to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "state-layer relative flex h-10 items-center gap-3 rounded-sm pr-2 pl-4 font-serif text-[19px]",
        active ? "text-on-surface" : "text-on-surface-variant",
      )}
    >
      {active && <Marker className="absolute top-1/2 left-0.5 -translate-y-1/2" />}
      <Icon name={d.icon} size={20} className={active ? "text-on-surface" : "text-outline"} />
      <span className="flex-1">{d.label}</span>
      {!!badge && <span className="font-sans text-label-medium text-primary">{badge}</span>}
    </Link>
  );
}

export function InviteButton({ onClick, className }: { onClick(): void; className?: string }) {
  return (
    <button type="button" onClick={onClick} className={cx("state-layer flex items-center gap-3 rounded-sm px-4 text-left text-label-large text-primary", className)}>
      <Icon name="person_add" size={20} />
      Invite a partner
    </button>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { rel, self, solo } = useRel();
  const todayBadge = useNeedsYou().count;
  const sections = useSections();
  const tab = tabFor(pathname, sections);
  const [newOpen, setNewOpen] = useState(false);
  const [safeOpen, setSafeOpen] = useState(false);
  // Subs and switches get the safe word on every page; an ended dynamic, or someone on their own, has no one to tell.
  // While roles are swapped, both people are somewhere new, so both get it.
  const canCall = !!self && (self.role !== "dominant" || rel.roleSwap?.status === "active") && !rel.endedAt && !solo;
  const [inviteOpen, setInviteOpen] = useState(false);
  const invite = solo ? () => setInviteOpen(true) : undefined;
  useEffect(() => setNewOpen(false), [pathname]);
  const lead: Menu["lead"] = tab === null ? null : tab === US && pathname !== US.to ? "back" : "switcher";
  const menu = useMemo<Menu>(
    () => ({ lead, safeWord: canCall ? () => setSafeOpen(true) : undefined, invite, banner: <SafeCallBanner /> }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead, canCall, solo],
  );
  const canAdd = !rel.endedAt;

  return (
    <MenuContext.Provider value={menu}>
      <div className="min-h-dvh bg-surface" data-nobar={!tab || undefined}>
        {/* Sidebar (desktop): the switcher where a logo would be, one flat list, Your dynamic and Settings at the bottom */}
        <nav className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col overflow-y-auto border-r border-outline-variant bg-surface px-3 py-4 md:flex">
          <div className="mb-4">
            <DynamicSwitcher />
          </div>
          {[TODAY, WEEK].map((d) => (
            <SideItem key={d.to} d={d} active={isActive(pathname, d.to)} badge={d === TODAY ? todayBadge : 0} />
          ))}
          <hr className="mx-4 my-2 border-outline-variant" />
          {sections.map((d) => (
            <SideItem key={d.to} d={d} active={isActive(pathname, d.to) || (d.to === "/rules" && (isActive(pathname, "/protocols") || pathname === "/rule-log"))} />
          ))}
          {invite && <InviteButton onClick={invite} className="mt-1 h-10" />}
          <div className="min-h-4 flex-1" />
          {[DYNAMIC, SETTINGS].map((d) => (
            <SideItem key={d.to} d={d} active={isActive(pathname, d.to)} />
          ))}
        </nav>

        <main className={cx(tab ? "pb-32" : "pb-10", "md:pb-10 md:pl-60")}>
          {/* Today brings its own side panel on wide screens, so it gets the full width. */}
          <div className={cx("mx-auto", pathname === "/" ? "max-w-5xl xl:max-w-none" : "max-w-5xl")}>
            {rel.endedAt && pathname !== "/dynamic" && (
              <Link
                to="/dynamic"
                className="state-layer mx-4 mt-3 flex items-center gap-3 rounded-lg border border-outline-variant px-4 py-3 text-body-medium text-on-surface-variant md:mx-6"
              >
                <Icon name="inventory_2" className="shrink-0" />
                <span className="min-w-0 flex-1">This dynamic has ended. It's kept here read-only.</span>
                <Icon name="chevron_right" />
              </Link>
            )}
            <Outlet />
          </div>
        </main>

        {/* Phone: Today, Week and Us, with + for anything new */}
        <nav
          className={cx(
            "fixed inset-x-0 bottom-0 z-30 flex h-[calc(68px+env(safe-area-inset-bottom))] items-start justify-between border-t border-outline-variant bg-surface px-7 pb-[env(safe-area-inset-bottom)] md:hidden",
            !tab && "hidden",
          )}
        >
          <div className="flex h-17 items-center gap-7.5">
            <Tab d={TODAY} active={tab === TODAY} badge={todayBadge} />
            <Tab d={WEEK} active={tab === WEEK} />
            <Tab d={US} active={tab === US} />
          </div>
          {canAdd && (
            <button
              type="button"
              aria-label="New"
              title="New"
              onClick={() => setNewOpen(true)}
              className="state-layer -mt-5 flex size-14 shrink-0 items-center justify-center rounded-2xl bg-on-surface text-surface shadow-[0_0_0_6px_var(--md-surface)]"
            >
              <Icon name="add" size={28} />
            </button>
          )}
        </nav>
        <NewSheet open={newOpen} onClose={() => setNewOpen(false)} />
        {solo && <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />}
        {canCall && <SafeWordSheet open={safeOpen} onClose={() => setSafeOpen(false)} />}
      </div>
    </MenuContext.Provider>
  );
}
