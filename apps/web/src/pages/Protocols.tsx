import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useLibrary, useReorder } from "../api/hooks";
import { errorMessage } from "../api/client";
import { SortableList } from "../components/SortableList";
import { Empty, ErrorBox, Fab, Icon, Loading, PageHeader, useSnackbar } from "../components/ui";
import { useRel } from "../lib/relationship";
import { excerpt } from "./Notes";
import { sortRules } from "./Rules";

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

  return (
    <>
      <PageHeader
        title="Protocols"
        subtitle={`${protocols.length} protocol${protocols.length === 1 ? "" : "s"}`}
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
            return (
              <div className="flex items-start gap-1 rounded-md bg-surface-container-low py-2 pr-2 pl-1">
                {handle ?? <span className="w-3" />}
                <button type="button" onClick={() => open(p.id)} className="state-layer flex min-w-0 flex-1 flex-col gap-1 rounded-sm p-2 text-left">
                  <span className="text-title-medium text-on-surface">{p.title}</span>
                  {rule && (
                    <span className="flex items-center gap-1 text-label-medium text-primary">
                      <Icon name="gavel" size={16} /> {rule}
                    </span>
                  )}
                  {p.bodyMd && <span className="line-clamp-3 text-body-medium whitespace-pre-line text-on-surface-variant">{excerpt(p.bodyMd, 240)}</span>}
                </button>
              </div>
            );
          }}
        </SortableList>
      </ol>
      {isDom && <Fab icon="add" label="New protocol" onClick={() => open("new")} />}
    </>
  );
}
