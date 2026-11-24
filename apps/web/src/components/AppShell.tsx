import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import type { Features } from "../api/types";
import { MenuContext, type Menu } from "../lib/menu";
import { useRel } from "../lib/relationship";
import { useHistoryTrail } from "../lib/origin";
import { useNeedsYou } from "../lib/today";
import { DynamicSwitcher } from "./DynamicSwitcher";
import { InviteSheet } from "../pages/Dynamic";
import { SafeCallBanner, SafeWordSheet } from "./SafeCall";
import { SwapDialog, swapPartner } from "./RoleSwap";
import { Chip, Dialog, Icon, cx } from "./ui";

export interface Dest {
  to: string;
  label: string;
  icon: string;
  /** One line on the Us page. */
  /** Hidden when the dynamic switches this feature off. */
  feature?: keyof Features;
}

/** The phone's three tabs. Week is the calendar; Us lists everything else. */
const TODAY: Dest = { to: "/", label: "Today", icon: "today" };
const WEEK: Dest = { to: "/calendar", label: "Week", icon: "calendar_month" };
const US: Dest = { to: "/us", label: "Us", icon: "favorite" };

/** Everything the tabs don't cover, in the order Us and the desktop sidebar list them. Protocols live inside Rules. */
const SECTIONS: Dest[] = [
  { to: "/rules", label: "Rules", icon: "gavel", feature: "rules" },
  { to: "/rewards", label: "Rewards", icon: "redeem", feature: "points" },
  { to: "/consequences", label: "Consequences", icon: "bolt", feature: "consequences" },
  { to: "/notes", label: "Notes", icon: "sticky_note_2" },
  { to: "/journal", label: "Journal", icon: "auto_stories", feature: "journal" },
  { to: "/limits", label: "Limits", icon: "tune", feature: "limits" },
  { to: "/agreement", label: "Agreement", icon: "handshake", feature: "agreement" },
  { to: "/scenes", label: "Scenes", icon: "auto_awesome", feature: "scenes" },
  { to: "/chastity", label: "Chastity", icon: "lock", feature: "chastity" },
  { to: "/location", label: "Location", icon: "location_on", feature: "location" },
  { to: "/stats", label: "Stats", icon: "insights", feature: "stats" },
  { to: "/review", label: "Monthly review", icon: "flag", feature: "review" },
  { to: "/kits", label: "Kits", icon: "widgets" },
  { to: "/tasks", label: "All tasks", icon: "checklist" },
];

const PROTOCOLS: Dest = { to: "/protocols", label: "Protocols", icon: "fact_check", feature: "protocols" };

/** Your dynamic and Settings: not sections, so they sit at the bottom of Us and the sidebar. */
export const DYNAMIC: Dest = { to: "/dynamic", label: "Your dynamic", icon: "favorite" };
export const SETTINGS: Dest = { to: "/settings", label: "Settings", icon: "settings" };

/** What needs a second person, so it stays out of the way while someone is on their own. */
const NOT_SOLO = ["/agreement", "/chastity"];

/** Pages that count as part of Us on the phone: the tab stays marked and the header leads back to where they were opened from (Us when it isn't known). */
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

/** What a back link calls a page: its tab or section name, or undefined when it has none (a task, a note). */
function labelFor(pathname: string, sections: Dest[]): string | undefined {
  const all = [TODAY, WEEK, US, ...sections, PROTOCOLS, DYNAMIC, SETTINGS, { to: "/rule-log", label: "Rule log", icon: "" }];
  return all.find((d) => d.to === pathname)?.label;
}

/** The tab a page under Us was reached from: the nearest Today, Week or Us page behind it, else Us. */
function originTab(trail: { index: number; at(i: number): string | undefined }, sections: Dest[]): Dest {
  for (let i = trail.index - 1; i >= 0; i--) {
    const p = trail.at(i);
    if (p === undefined) break;
    const t = tabFor(p, sections);
    if (t === TODAY || t === WEEK) return t;
    if (p === US.to) return US;
  }
  return US;
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

/** What the + button can start (mockup 17). Each one opens where it's made, with its form already open where the page has one. */
function useNewItems() {
  const { isDom, features, solo, rel } = useRel();
  const items: { label: string; icon: string; go: { to: string; params?: Record<string, string>; search?: Record<string, string> } }[] = [];
  if (rel.endedAt) return items;
  if (isDom) items.push({ label: "Task", icon: "check_box", go: { to: "/tasks/$taskId", params: { taskId: "new" } } });
  items.push({ label: "Plan", icon: "event", go: { to: "/calendar", search: { new: "1" } } });
  items.push({ label: "Note", icon: "edit_square", go: { to: "/notes/$noteId", params: { noteId: "new" } } });
  if (features.journal) items.push({ label: "Journal entry", icon: "menu_book", go: { to: "/journal/$noteId", params: { noteId: "new" } } });
  if (features.scenes && !solo) items.push({ label: "Log a scene", icon: "bedtime", go: { to: "/scenes", search: { new: "1" } } });
  if (features.rules)
    items.push({ label: isDom ? "Log a broken rule" : "Own up to a rule", icon: "receipt_long", go: { to: "/rule-log", search: { new: "1" } } });
  if (features.consequences && isDom) items.push({ label: "Assign a consequence", icon: "bolt", go: { to: "/consequences" } });
  if (isDom) items.push({ label: "Start from a kit", icon: "stacks", go: { to: "/kits" } });
  return items;
}

function NewSheet({ open, onClose }: { open: boolean; onClose(): void }) {
  const items = useNewItems();
  const navigate = useNavigate();
  const { rel, me, self } = useRel();
  const [extra, setExtra] = useState<"swap" | "invite" | null>(null);
  const canSwap = !rel.endedAt && !rel.roleSwap && self?.role !== "switch" && !!swapPartner(rel, me.user.id);
  const canInvite = !rel.endedAt;
  return (
    <>
      <Dialog open={open} onClose={onClose}>
        <div className="eyebrow">New</div>
        <ul className="mt-2 flex flex-col">
          {items.map((it) => (
            <li key={it.label} className="border-b border-outline-variant last:border-b-0">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void navigate(it.go as never);
                }}
                className="state-layer -mx-2 flex w-[calc(100%+16px)] items-center gap-4 rounded-md px-2 py-3.5 text-left outline-none"
              >
                <Icon name={it.icon} size={22} className="text-on-surface-variant" />
                <span className="min-w-0 flex-1 font-serif text-[22px] leading-7 text-on-surface">{it.label}</span>
              </button>
            </li>
          ))}
        </ul>
        {(canSwap || canInvite) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {canSwap && (
              <Chip
                plain
                icon="swap_horiz"
                onClick={() => {
                  onClose();
                  setExtra("swap");
                }}
              >
                Ask to swap roles
              </Chip>
            )}
            {canInvite && (
              <Chip
                plain
                icon="person_add"
                onClick={() => {
                  onClose();
                  setExtra("invite");
                }}
              >
                Invite
              </Chip>
            )}
          </div>
        )}
      </Dialog>
      <SwapDialog open={extra === "swap"} onClose={() => setExtra(null)} />
      <InviteSheet open={extra === "invite"} onClose={() => setExtra(null)} />
    </>
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
  // A page under Us opened from Week (All tasks) or Today goes back there, named for it, with that tab still marked.
  const navigate = useNavigate();
  const trail = useHistoryTrail();
  const from = lead === "back" ? trail.at(trail.index - 1) : undefined;
  const fromLabel = from ? labelFor(from, sections) : undefined;
  const homeTab = lead === "back" ? originTab(trail, sections) : tab;
  const backLabel = fromLabel ?? "Us";
  const menu = useMemo<Menu>(
    () => ({
      lead,
      back: { label: backLabel, go: () => (fromLabel ? window.history.back() : void navigate({ to: US.to })) },
      safeWord: canCall ? () => setSafeOpen(true) : undefined,
      invite,
      banner: <SafeCallBanner />,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lead, backLabel, fromLabel, canCall, solo],
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
          {/* Today brings its own side panel on wide screens, notes their list beside the open one, and rewards a panel of what's waiting, so they get the full width. */}
          <div className={cx("mx-auto", pathname === "/" ? "max-w-5xl xl:max-w-none" : pathname.startsWith("/notes") || pathname === "/rewards" ? "max-w-5xl lg:max-w-none" : "max-w-5xl")}>
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
            <Tab d={TODAY} active={homeTab === TODAY} badge={todayBadge} />
            <Tab d={WEEK} active={homeTab === WEEK} />
            <Tab d={US} active={homeTab === US} />
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
