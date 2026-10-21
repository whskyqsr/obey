import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Relationship } from "../api/types";
import { ROLE_LABEL, relTitle, useRel } from "../lib/relationship";
import { Avatar } from "./Avatar";
import { Icon, cx } from "./ui";

/** A dynamic's mark: the partner's picture, or your own in a dynamic nobody has joined yet. */
export function DynamicMark({ rel, size = 40 }: { rel: Relationship; size?: number }) {
  const { me } = useRel();
  const who = rel.members.find((m) => m.userId !== me.user.id) ?? rel.members.find((m) => m.userId === me.user.id);
  if (!who) return null;
  return <Avatar userId={who.userId} name={who.displayName} version={who.avatarVersion ?? null} size={size} />;
}

/** "with Sam", or the dynamic's own name. */
function label(rel: Relationship, myId: string) {
  return rel.name || rel.members.length < 2 ? relTitle(rel, myId) : `with ${relTitle(rel, myId)}`;
}

function subtitle(rel: Relationship, myId: string) {
  const self = rel.members.find((m) => m.userId === myId);
  if (rel.endedAt) return "Ended";
  return self ? `You're the ${ROLE_LABEL[self.role]}` : "";
}

/** Every dynamic, the current one checked, and a way to join or start another. */
function DynamicList({ onPick }: { onPick(): void }) {
  const { me, rel, select } = useRel();
  const navigate = useNavigate();
  return (
    <ul className="flex flex-col gap-0.5">
      {[...me.relationships]
        .sort((a, b) => Number(b.id === rel.id) - Number(a.id === rel.id) || Number(!!a.endedAt) - Number(!!b.endedAt))
        .map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => {
                onPick();
                if (r.id !== rel.id) {
                  select(r.id);
                  void navigate({ to: "/" });
                }
              }}
              className={cx("state-layer flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left", r.id === rel.id && "bg-secondary-container")}
            >
              <DynamicMark rel={r} size={36} />
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-label-large", r.endedAt ? "text-on-surface-variant" : "text-on-surface")}>{label(r, me.user.id)}</span>
                <span className="block truncate text-body-small text-on-surface-variant">{subtitle(r, me.user.id)}</span>
              </span>
              {r.id === rel.id && <Icon name="check" className="text-on-secondary-container" />}
            </button>
          </li>
        ))}
      <li>
        <button
          type="button"
          onClick={() => {
            onPick();
            void navigate({ to: "/onboarding" });
          }}
          className="state-layer flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left text-label-large text-on-surface-variant"
        >
          <span className="flex size-9 items-center justify-center rounded-full border border-dashed border-outline">
            <Icon name="add" size={20} />
          </span>
          Join or start another
        </button>
      </li>
    </ul>
  );
}

/**
 * Where the Fealty mark was: the dynamic in view. With more than one dynamic it opens a list to switch.
 * `inline` expands the list in place (the phone menu); otherwise it pops over (sidebar and rail).
 */
export function DynamicSwitcher({ compact, inline, onSwitched }: { compact?: boolean; inline?: boolean; onSwitched?(): void }) {
  const { me, rel } = useRel();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // The rail scrolls, so its popover is placed against the window rather than clipped inside it.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const many = me.relationships.length > 1;
  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => !inline && !ref.current?.contains(e.target as Node) && setOpen(false);
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", click);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", click);
      window.removeEventListener("keydown", key);
    };
  }, [open, inline]);
  const name = label(rel, me.user.id);
  const toggle = () => {
    if (!many) return void navigate({ to: "/dynamic" });
    const r = ref.current?.getBoundingClientRect();
    if (r) setAt({ top: r.top, left: r.right + 8 });
    setOpen((o) => !o);
  };

  return (
    <div ref={ref} className={cx("relative", !compact && "w-full")}>
      {compact ? (
        <button type="button" onClick={toggle} title={name} aria-expanded={many ? open : undefined} className="state-layer relative rounded-2xl p-1">
          <DynamicMark rel={rel} size={48} />
          {many && (
            <span className="absolute right-0 bottom-0 flex size-5 items-center justify-center rounded-full bg-surface-container-highest text-on-surface-variant ring-2 ring-surface">
              <Icon name="unfold_more" size={14} />
            </span>
          )}
        </button>
      ) : (
        <button type="button" onClick={toggle} aria-expanded={many ? open : undefined} className="state-layer flex w-full items-center gap-3 rounded-2xl px-3 py-2 text-left">
          <DynamicMark rel={rel} size={40} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-title-medium text-on-surface">{name}</span>
            <span className="block truncate text-body-small text-on-surface-variant">{subtitle(rel, me.user.id)}</span>
          </span>
          {many && <Icon name={inline && open ? "expand_less" : "unfold_more"} className="text-on-surface-variant" />}
        </button>
      )}
      {open &&
        (inline ? (
          <div className="mt-1 mb-2 rounded-3xl bg-surface-container p-1.5">
            <DynamicList onPick={() => (setOpen(false), onSwitched?.())} />
          </div>
        ) : (
          <div className={cx("z-50 rounded-3xl bg-surface-container-high p-1.5 shadow-elev-2", compact ? "fixed w-72" : "mt-1")} style={compact && at ? at : undefined}>
            <DynamicList onPick={() => setOpen(false)} />
          </div>
        ))}
    </div>
  );
}
