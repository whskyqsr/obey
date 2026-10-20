import { Link } from "@tanstack/react-router";
import { Suspense, lazy, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useReorder } from "../api/hooks";
import { errorMessage } from "../api/client";
import { SortableList } from "../components/SortableList";
import { Empty, ErrorBox, Fab, Icon, IconButton, Loading, PageHeader, cx, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { excerpt } from "./Notes";
import { sortRules } from "./Rules";

// TipTap is heavy; load it the first time a protocol is expanded.
const MarkdownEditor = lazy(() => import("../components/MarkdownEditor").then((m) => ({ default: m.MarkdownEditor })));

export function ProtocolsPage() {
  const { rel, isDom, features } = useRel();
  const snack = useSnackbar();
  const navigate = useNavigate();
  const list = useLibrary(rel.id, "protocols");
  const rulesQ = useLibrary(rel.id, "rules");
  const reorder = useReorder(rel.id, "protocols");

  const protocols = useMemo(() => sortRules(list.data ?? []), [list.data]);
  const rules = useMemo(() => (features.rules ? sortRules(rulesQ.data ?? []) : []), [rulesQ.data, features.rules]);
  const ruleLabel = (id: string | null) => {
    const i = rules.findIndex((r) => r.id === id);
    return i < 0 ? null : `Rule ${i + 1}: ${rules[i]!.title}`;
  };
  const open = (protocolId: string) => navigate({ to: "/protocols/$protocolId", params: { protocolId } });
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((s) => toggled(s, id));
  // Protocols whose text runs past the collapsed height, so they get a chevron.
  const [overflowing, setOverflowing] = useState<Set<string>>(new Set());

  return (
    <>
      <PageHeader
        title="Protocols"
        subtitle={`${protocols.length} protocol${protocols.length === 1 ? "" : "s"}`}
        actions={
          <Link to="/rule-log" className="state-layer flex h-10 items-center gap-2 rounded-full border border-outline px-4 text-label-large text-primary">
            <Icon name="history" size={18} /> Broken-rule log
          </Link>
        }
      />
      <ol className="flex flex-col gap-2 px-4 md:px-6">
        {list.isLoading && <Loading />}
        {list.error && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
        {list.data && !list.data.length && (
          <Empty icon="fact_check" title="No protocols yet" body={isDom ? "Spell out exactly what's expected, and when and how it's done." : undefined} />
        )}
        <SortableList items={protocols} enabled={isDom} onReorder={(next) => reorder.mutate(next, { onError: (e) => snack(errorMessage(e)) })}>
          {(p, _i, handle) => {
            const rule = ruleLabel(p.ruleId);
            const isOpen = expanded.has(p.id);
            return (
              <div className="flex items-start gap-1 rounded-md bg-surface-container-low py-2 pr-2 pl-1">
                {handle ?? <span className="w-3" />}
                {/* The whole card opens the protocol; only the chevron stays on the list. */}
                <div className="relative min-w-0 flex-1 p-2">
                  <button type="button" className="state-layer absolute inset-0 rounded-sm" aria-label={`Open ${p.title}`} onClick={() => open(p.id)} />
                  <div className="pointer-events-none flex flex-col gap-1">
                    <span className="text-title-medium text-on-surface">{p.title}</span>
                    {rule && (
                      <span className="flex items-center gap-1 text-label-medium text-primary">
                        <Icon name="gavel" size={16} /> {rule}
                      </span>
                    )}
                    {p.bodyMd && (
                      <Clamp open={isOpen} onOverflow={(cut) => setOverflowing((s) => (cut === s.has(p.id) ? s : toggled(s, p.id)))}>
                        <Suspense fallback={<span className="line-clamp-3 text-body-medium text-on-surface-variant">{excerpt(p.bodyMd, 240)}</span>}>
                          <MarkdownEditor value={p.bodyMd} onChange={() => {}} editable={false} bare />
                        </Suspense>
                      </Clamp>
                    )}
                  </div>
                </div>
                {overflowing.has(p.id) || isOpen ? (
                  <IconButton icon={isOpen ? "expand_less" : "expand_more"} label={isOpen ? "Show less" : "Show more"} aria-expanded={isOpen} onClick={() => toggle(p.id)} />
                ) : (
                  <span className="w-10" />
                )}
              </div>
            );
          }}
        </SortableList>
      </ol>
      {isDom && <Fab icon="add" label="New protocol" onClick={() => open("new")} />}
    </>
  );
}

const toggled = (s: Set<string>, id: string) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set([...s, id]));

/** Formatted text cut to a few lines with a fade, or shown whole when open. Reports whether it's cut. */
function Clamp({ open, onOverflow, children }: { open: boolean; onOverflow(cut: boolean): void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      if (open) return;
      const c = el.scrollHeight > el.clientHeight + 1;
      setCut(c);
      onOverflow(c);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => ro.disconnect();
  });
  // The editor's own padding is trimmed so a short protocol isn't mistaken for a cut one.
  return (
    <div
      ref={ref}
      className={cx("[&_.prose-m3]:py-1 [&_.prose-m3>*:last-child]:mb-0", !open && "max-h-32 overflow-hidden")}
      style={!open && cut ? { maskImage: "linear-gradient(to bottom, black 60%, transparent)", WebkitMaskImage: "linear-gradient(to bottom, black 60%, transparent)" } : undefined}
    >
      {children}
    </div>
  );
}
