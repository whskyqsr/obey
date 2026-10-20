import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { Features } from "../api/types";
import { useRel } from "../lib/relationship";
import { useNeedsYou } from "../lib/today";
import { Icon, cx } from "./ui";

interface Dest {
  to: string;
  label: string;
  icon: string;
  /** Hidden when the dynamic switches this feature off. */
  feature?: keyof Features;
}

const ALL: Dest[] = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/calendar", label: "Calendar", icon: "calendar_month" },
  { to: "/rewards", label: "Rewards", icon: "redeem", feature: "points" },
  { to: "/rules", label: "Rules", icon: "gavel", feature: "rules" },
  { to: "/protocols", label: "Protocols", icon: "fact_check", feature: "protocols" },
  { to: "/consequences", label: "Consequences", icon: "bolt", feature: "consequences" },
  { to: "/notes", label: "Notes", icon: "sticky_note_2" },
  { to: "/journal", label: "Journal", icon: "auto_stories", feature: "journal" },
  // Tasks open from Today and Calendar; the full list is for managing them.
  { to: "/tasks", label: "All tasks", icon: "checklist" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const MORE: Dest = { to: "/more", label: "More", icon: "menu" };

/** Destinations the desktop drawer pins to the bottom instead of the main list. */
const DRAWER_BOTTOM = ["/settings"];

/** Destinations for the current dynamic: everything, plus the compact bar and what overflows into More. */
export function useDestinations() {
  const { features } = useRel();
  const all = ALL.filter((d) => !d.feature || features[d.feature]);
  // The bar holds Today, Calendar, the next section that's on, and the first writing space; the rest go under More.
  const isWriting = (d: Dest) => d.to === "/notes" || d.to === "/journal";
  const writing = all.find(isWriting);
  const bar = [...all.filter((d) => !isWriting(d)).slice(0, 3), ...(writing ? [writing] : []), MORE];
  const more = all.filter((d) => !bar.includes(d));
  return { all, bar, more };
}

function isActive(pathname: string, to: string, more: Dest[]) {
  if (to === "/") return pathname === "/";
  if (to === "/more") return ["/more", "/onboarding", ...more.map((d) => d.to)].some((p) => pathname.startsWith(p));
  return pathname === to || pathname.startsWith(to + "/");
}

function NavItem({ d, active, badge, compact }: { d: Dest; active: boolean; badge?: number; compact?: boolean }) {
  return (
    <Link to={d.to} className={cx("group flex flex-col items-center gap-1 outline-none", compact ? "flex-1 pt-3 pb-4" : "w-full py-1")} aria-current={active ? "page" : undefined}>
      <span
        className={cx(
          "state-layer relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
          active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
        )}
      >
        <Icon name={d.icon} filled={active} />
        {!!badge && (
          <span className="absolute top-0 right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-label-small text-on-error">{badge}</span>
        )}
      </span>
      <span className={cx("text-label-medium", active ? "text-on-surface" : "text-on-surface-variant")}>{d.label}</span>
    </Link>
  );
}

/** A drawer item: icon and label in a row, the active one in a pill, and an optional count. */
function DrawerItem({ d, active, badge }: { d: Dest; active: boolean; badge?: number }) {
  return (
    <Link
      to={d.to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "state-layer flex h-12 items-center gap-3 rounded-full px-4 text-label-large",
        active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
      )}
    >
      <Icon name={d.icon} filled={active} />
      <span className="flex-1">{d.label}</span>
      {!!badge && <span className="text-label-large">{badge}</span>}
    </Link>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { title, me, rel } = useRel();
  const todayBadge = useNeedsYou().count;
  const { all, bar, more } = useDestinations();
  // The editor's Save is the only action that matters while editing, so the phone bar steps aside.
  const editing = /^\/tasks\/(new|[^/]+\/edit)$/.test(pathname);

  return (
    <div className="min-h-dvh bg-surface">
      {/* Navigation drawer (large): one list, with Settings at the bottom */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-1 overflow-y-auto border-r border-outline-variant/40 bg-surface px-3 py-4 lg:flex">
        <Link to="/" className="mb-3 flex items-center gap-3 px-3" title={title}>
          <span className="flex size-10 items-center justify-center rounded-md bg-primary-container text-on-primary-container">
            <Icon name="link" filled />
          </span>
          <span className="text-title-large text-on-surface">Fealty</span>
        </Link>
        {all
          .filter((d) => !DRAWER_BOTTOM.includes(d.to))
          .map((d) => (
            <DrawerItem key={d.to} d={d} active={isActive(pathname, d.to, [])} badge={d.to === "/" ? todayBadge : 0} />
          ))}
        <div className="flex-1" />
        {all
          .filter((d) => DRAWER_BOTTOM.includes(d.to))
          .map((d) => (
            <DrawerItem key={d.to} d={d} active={isActive(pathname, d.to, [])} />
          ))}
      </nav>

      {/* Navigation rail (medium) */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-3 overflow-y-auto bg-surface pt-4 pb-4 md:flex lg:hidden">
        <Link to="/" className="mb-4 flex size-14 items-center justify-center rounded-lg bg-primary-container text-on-primary-container" title={title}>
          <Icon name="link" filled />
        </Link>
        {all.map((d) => (
          <NavItem key={d.to} d={d} active={isActive(pathname, d.to, more)} badge={d.to === "/" ? todayBadge : 0} />
        ))}
      </nav>

      <main className={cx(editing ? "pb-10" : "pb-28", "md:pb-10 md:pl-24 lg:pl-64")}>
        {/* Today brings its own side panel on wide screens, so it gets the full width. */}
        <div className={cx("mx-auto", pathname === "/" ? "max-w-5xl xl:max-w-none" : "max-w-5xl")}>
          {rel.endedAt && pathname !== "/dynamic" && (
            <Link
              to="/dynamic"
              className="state-layer mx-4 mt-3 flex items-center gap-3 rounded-lg bg-surface-container-high px-4 py-3 text-body-medium text-on-surface-variant md:mx-6"
            >
              <Icon name="inventory_2" className="shrink-0" />
              <span className="min-w-0 flex-1">This dynamic has ended. It's kept here read-only.</span>
              <Icon name="chevron_right" />
            </Link>
          )}
          <Outlet />
        </div>
      </main>

      {/* Navigation bar (compact) */}
      <nav className={cx("fixed inset-x-0 bottom-0 z-30 flex bg-surface-container pb-[env(safe-area-inset-bottom)] md:hidden", editing && "hidden")}>
        {bar.map((d) => (
          <NavItem key={d.to} d={d} compact active={isActive(pathname, d.to, more)} badge={d.to === "/" ? todayBadge : 0} />
        ))}
      </nav>
    </div>
  );
}
