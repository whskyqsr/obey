import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { usePendingReschedules } from "../api/hooks";
import { useRel } from "../lib/relationship";
import { Icon, cx } from "./ui";

interface Dest {
  to: string;
  label: string;
  icon: string;
}

export const DESTINATIONS: Dest[] = [
  { to: "/", label: "Today", icon: "today" },
  { to: "/calendar", label: "Calendar", icon: "calendar_month" },
  { to: "/tasks", label: "Tasks", icon: "checklist" },
  { to: "/rewards", label: "Rewards", icon: "redeem" },
  { to: "/rules", label: "Rules", icon: "gavel" },
  { to: "/consequences", label: "Consequences", icon: "bolt" },
  { to: "/notes", label: "Notes", icon: "sticky_note_2" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const MOBILE: Dest[] = [
  DESTINATIONS[0]!,
  DESTINATIONS[1]!,
  DESTINATIONS[2]!,
  DESTINATIONS[6]!,
  { to: "/more", label: "More", icon: "menu" },
];
const MORE_PATHS = ["/more", "/rewards", "/rules", "/consequences", "/settings", "/onboarding"];

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  if (to === "/more") return MORE_PATHS.some((p) => pathname.startsWith(p));
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
  const { rel, isDom } = useRel();
  const pending = usePendingReschedules(rel.id);
  const todayBadge = isDom ? (pending.data?.length ?? 0) : 0;

  return (
    <div className="min-h-dvh bg-surface">
      {/* Navigation rail (medium and larger) */}
      <nav className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-3 overflow-y-auto bg-surface pt-4 pb-4 md:flex">
        <Link to="/" className="mb-4 flex size-14 items-center justify-center rounded-lg bg-primary-container text-on-primary-container" title={rel.name}>
          <Icon name="link" filled />
        </Link>
        {DESTINATIONS.map((d) => (
          <NavItem key={d.to} d={d} active={isActive(pathname, d.to)} badge={d.to === "/" ? todayBadge : 0} />
        ))}
      </nav>

      <main className="pb-28 md:pb-10 md:pl-24">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>

      {/* Navigation bar (compact) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex bg-surface-container pb-[env(safe-area-inset-bottom)] md:hidden">
        {MOBILE.map((d) => (
          <NavItem key={d.to} d={d} compact active={isActive(pathname, d.to)} badge={d.to === "/" ? todayBadge : 0} />
        ))}
      </nav>
    </div>
  );
}
