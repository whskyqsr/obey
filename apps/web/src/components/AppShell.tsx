import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { usePendingReschedules } from "../api/hooks";
import type { Features } from "../api/types";
import { useRel } from "../lib/relationship";
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
  { to: "/tasks", label: "Tasks", icon: "checklist" },
  { to: "/rewards", label: "Rewards", icon: "redeem", feature: "points" },
  { to: "/rules", label: "Rules", icon: "gavel", feature: "rules" },
  { to: "/consequences", label: "Consequences", icon: "bolt", feature: "consequences" },
  { to: "/notes", label: "Notes", icon: "sticky_note_2", feature: "notes" },
  { to: "/journal", label: "Journal", icon: "auto_stories", feature: "journal" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const MORE: Dest = { to: "/more", label: "More", icon: "menu" };

/** Destinations for the current dynamic: everything, plus the compact bar and what overflows into More. */
export function useDestinations() {
  const { features } = useRel();
  const all = ALL.filter((d) => !d.feature || features[d.feature]);
  // The bar holds Today, Calendar, Tasks and the first writing space that's on; the rest go under More.
  const writing = all.find((d) => d.to === "/notes" || d.to === "/journal");
  const bar = [...all.slice(0, 3), ...(writing ? [writing] : []), MORE];
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
    <Link
      to={d.to}
      className={cx("group flex flex-col items-center gap-1 outline-none", compact ? "flex-1 pt-3 pb-4" : "w-full py-1")}
      aria-current={active ? "page" : undefined}
    >
      <span
        className={cx(
          "state-layer relative flex h-8 w-14 items-center justify-center rounded-full transition-colors",
          active ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
        )}
      >
        <Icon name={d.icon} filled={active} />
        {!!badge && (
          <span className="absolute top-0 right-2.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-label-small text-on-error">
            {badge}
          </span>
        )}
      </span>
      <span className={cx("text-label-medium", active ? "text-on-surface" : "text-on-surface-variant")}>{d.label}</span>
    </Link>
  );
}

export function AppShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { rel, isDom, title } = useRel();
  const pending = usePendingReschedules(rel.id);
  const todayBadge = isDom ? (pending.data?.length ?? 0) : 0;
  const { all, bar, more } = useDestinations();

  return (
    <div className="min-h-dvh bg-surface">
      {/* Navigation rail (medium and larger) */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-3 overflow-y-auto bg-surface pt-4 pb-4 md:flex">
        <Link to="/" className="mb-4 flex size-14 items-center justify-center rounded-lg bg-primary-container text-on-primary-container" title={title}>
          <Icon name="link" filled />
        </Link>
        {all.map((d) => (
          <NavItem key={d.to} d={d} active={isActive(pathname, d.to, more)} badge={d.to === "/" ? todayBadge : 0} />
        ))}
      </nav>

      <main className="pb-28 md:pb-10 md:pl-24">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Navigation bar (compact) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex bg-surface-container pb-[env(safe-area-inset-bottom)] md:hidden">
        {bar.map((d) => (
          <NavItem key={d.to} d={d} compact active={isActive(pathname, d.to, more)} badge={d.to === "/" ? todayBadge : 0} />
        ))}
      </nav>
    </div>
  );
}
