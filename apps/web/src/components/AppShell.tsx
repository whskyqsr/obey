import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import type { Features } from "../api/types";
import { MenuContext, type Menu } from "../lib/menu";
import { useRel } from "../lib/relationship";
import { useNeedsYou } from "../lib/today";
import { DynamicSwitcher } from "./DynamicSwitcher";
import { SafeCallBanner, SafeWordSheet } from "./SafeCall";
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
  { to: "/stats", label: "Stats", icon: "insights", feature: "stats" },
  { to: "/review", label: "Monthly review", icon: "flag", feature: "review" },
  { to: "/agreement", label: "Agreement", icon: "handshake", feature: "agreement" },
  { to: "/scenes", label: "Scenes", icon: "auto_awesome", feature: "scenes" },
  // Tasks open from Today and Calendar; the full list is for managing them.
  { to: "/tasks", label: "All tasks", icon: "checklist" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

/** Destinations the desktop drawer pins to the bottom instead of the main list. */
const DRAWER_BOTTOM = ["/settings"];

/** Destinations for the current dynamic: everything, plus the phone's bar and what goes in its menu. */
export function useDestinations() {
  const { features } = useRel();
  const all = ALL.filter((d) => !d.feature || features[d.feature]);
  // The bar holds Today, Calendar, the next section that's on, and the first writing space; the rest go in the menu.
  const isWriting = (d: Dest) => d.to === "/notes" || d.to === "/journal";
  const writing = all.find(isWriting);
  // Stats, the monthly review, the agreement and scenes always sit in the menu, however many sections are switched off.
  const bar = [...all.filter((d) => !isWriting(d) && !["/stats", "/review", "/agreement", "/scenes"].includes(d.to)).slice(0, 3), ...(writing ? [writing] : [])];
  const more = all.filter((d) => !bar.includes(d));
  return { all, bar, more };
}

function isActive(pathname: string, to: string) {
  if (to === "/") return pathname === "/";
  return pathname === to || pathname.startsWith(to + "/");
}

/** A tile in the phone's floating bar: the current page fills its tile. */
function BarItem({ d, active, badge }: { d: Dest; active: boolean; badge?: number }) {
  return (
    <Link
      to={d.to}
      aria-current={active ? "page" : undefined}
      className={cx(
        "state-layer relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[18px] outline-none",
        active ? "bg-primary-container text-on-primary-container" : "text-on-surface-variant",
      )}
    >
      <Icon name={d.icon} filled={active} />
      <span className="text-label-medium">{d.label}</span>
      {!!badge && (
        <span className="absolute top-1.5 left-1/2 ml-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-label-small text-on-error">{badge}</span>
      )}
    </Link>
  );
}

/** The phone's menu: everything that isn't in the bar, sliding in from the left. */
function MenuDrawer({ open, onClose, items }: { open: boolean; onClose(): void; items: Dest[] }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  const bottom = [...items.filter((d) => DRAWER_BOTTOM.includes(d.to))];
  const row = (d: Dest) => (
    <Link
      key={d.to}
      to={d.to}
      onClick={onClose}
      aria-current={isActive(pathname, d.to) ? "page" : undefined}
      className={cx(
        "state-layer flex h-13 items-center gap-3 rounded-full px-4 text-label-large",
        isActive(pathname, d.to) ? "bg-secondary-container text-on-secondary-container" : "text-on-surface-variant",
      )}
    >
      <Icon name={d.icon} filled={isActive(pathname, d.to)} />
      {d.label}
    </Link>
  );
  return (
    <div className={cx("fixed inset-0 z-40 md:hidden", !open && "pointer-events-none")} aria-hidden={!open}>
      <div className={cx("absolute inset-0 bg-scrim/32 transition-opacity", open ? "opacity-100" : "opacity-0")} onClick={onClose} />
      <nav
        aria-label="Menu"
        className={cx(
          "absolute inset-y-0 left-0 flex w-[min(300px,85vw)] flex-col gap-0.5 overflow-y-auto rounded-r-3xl bg-surface-container-low px-3 pt-[calc(20px+env(safe-area-inset-top))] pb-4 transition-transform duration-300",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-2">
          <DynamicSwitcher inline onSwitched={onClose} />
        </div>
        {items.filter((d) => !DRAWER_BOTTOM.includes(d.to)).map(row)}
        <hr className="mx-4 my-2 border-outline-variant" />
        {row({ to: "/dynamic", label: "Your dynamic", icon: "favorite" })}
        {bottom.map(row)}
      </nav>
    </div>
  );
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
  const { rel, self } = useRel();
  const todayBadge = useNeedsYou().count;
  const { all, bar, more } = useDestinations();
  // The editor's Save is the only action that matters while editing, so the phone bar steps aside.
  const editing = /^\/tasks\/(new|[^/]+\/edit)$/.test(pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  const [safeOpen, setSafeOpen] = useState(false);
  // Subs and switches get the safe word on every page; an ended dynamic has no one to tell.
  const canCall = !!self && self.role !== "dominant" && !rel.endedAt;
  // The header's menu button, and whether it has scrolled out of view (then a floating copy takes its place).
  const [headerButton, setHeaderButton] = useState<HTMLElement | null>(null);
  const [buttonHidden, setButtonHidden] = useState(false);
  useEffect(() => {
    if (!headerButton || typeof IntersectionObserver === "undefined") return setButtonHidden(false);
    const io = new IntersectionObserver(([e]) => setButtonHidden(!e!.isIntersecting));
    io.observe(headerButton);
    return () => io.disconnect();
  }, [headerButton]);
  useEffect(() => setMenuOpen(false), [pathname]);
  const menu = useMemo<Menu>(
    () => ({ open: () => setMenuOpen(true), track: setHeaderButton, safeWord: canCall ? () => setSafeOpen(true) : undefined, banner: <SafeCallBanner /> }),
    [canCall],
  );

  return (
    <MenuContext.Provider value={menu}>
      <div className="min-h-dvh bg-surface">
        {/* Navigation drawer (large): one list, with Settings at the bottom */}
        <nav className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col gap-1 overflow-y-auto border-r border-outline-variant/40 bg-surface px-3 py-4 lg:flex">
          <div className="mb-3">
            <DynamicSwitcher />
          </div>
          {all
            .filter((d) => !DRAWER_BOTTOM.includes(d.to))
            .map((d) => (
              <DrawerItem key={d.to} d={d} active={isActive(pathname, d.to)} badge={d.to === "/" ? todayBadge : 0} />
            ))}
          <div className="flex-1" />
          {all
            .filter((d) => DRAWER_BOTTOM.includes(d.to))
            .map((d) => (
              <DrawerItem key={d.to} d={d} active={isActive(pathname, d.to)} />
            ))}
        </nav>

        {/* Navigation rail (medium) */}
        <nav className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center gap-3 overflow-y-auto bg-surface pt-4 pb-4 md:flex lg:hidden">
          <div className="mb-4">
            <DynamicSwitcher compact />
          </div>
          {all.map((d) => (
            <NavItem key={d.to} d={d} active={isActive(pathname, d.to)} badge={d.to === "/" ? todayBadge : 0} />
          ))}
        </nav>

        <main className={cx(editing ? "pb-10" : "pb-44", "md:pb-10 md:pl-24 lg:pl-64")}>
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

        {/* Navigation bar (compact): a floating row of tiles */}
        <nav
          className={cx(
            "fixed inset-x-3 bottom-[calc(16px+env(safe-area-inset-bottom))] z-30 flex h-19 gap-1 rounded-3xl border border-outline-variant/70 bg-surface-container-lowest p-1.5 shadow-elev-2 md:hidden",
            editing && "hidden",
          )}
        >
          {bar.map((d) => (
            <BarItem key={d.to} d={d} active={isActive(pathname, d.to)} badge={d.to === "/" ? todayBadge : 0} />
          ))}
        </nav>
        {/* Once the header's menu button scrolls away, it floats at the top left. */}
        {buttonHidden && !editing && (
          <button
            type="button"
            aria-label="Menu"
            title="Menu"
            onClick={() => setMenuOpen(true)}
            className="state-layer fixed top-[calc(12px+env(safe-area-inset-top))] left-3 z-30 flex size-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface shadow-elev-2 md:hidden"
          >
            <Icon name="menu" />
          </button>
        )}
        <MenuDrawer open={menuOpen} onClose={() => setMenuOpen(false)} items={more} />
        {canCall && <SafeWordSheet open={safeOpen} onClose={() => setSafeOpen(false)} />}
      </div>
    </MenuContext.Provider>
  );
}
