import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, apiObjectUrl } from "./client";
import type {
  InvitePreview,
  Balance,
  Features,
  EditOccurrence,
  HistoryEntry,
  TaskStats,
  TaskStreak,
  AssignConsequenceInput,
  WeekStart,
  Invite,
  LedgerEntry,
  LibraryKind,
  LibraryTypes,
  Me,
  Occurrence,
  Relationship,
  RescheduleInput,
  RescheduleDayInput,
  RescheduleRequest,
  RescheduleResult,
  Role,
  Task,
  TaskInput,
  User,
} from "./types";

export const keys = {
  me: ["me"] as const,
  tasks: (rel: string) => ["rel", rel, "tasks"] as const,
  occurrences: (rel: string, from: string, to: string) => ["rel", rel, "occurrences", from, to] as const,
  reschedules: (rel: string) => ["rel", rel, "reschedules"] as const,
  ledger: (rel: string) => ["rel", rel, "ledger"] as const,
  balances: (rel: string) => ["rel", rel, "balances"] as const,
  library: (rel: string, kind: LibraryKind) => ["rel", rel, kind] as const,
};

/** Invalidate everything belonging to a relationship (occurrences, balances and so on interlock). */
function useInvalidateRel(rel: string | undefined) {
  const qc = useQueryClient();
  return (...extra: QueryKey[]) => {
    if (rel) void qc.invalidateQueries({ queryKey: ["rel", rel] });
    for (const k of extra) void qc.invalidateQueries({ queryKey: k });
  };
}

// ---- task history

const HISTORY_PAGE = 30;

export function useTaskHistory(rel: string, taskId: string) {
  return useInfiniteQuery({
    queryKey: ["rel", rel, "history", taskId],
    queryFn: ({ pageParam }) => api<HistoryEntry[]>(`/tasks/${taskId}/history`, { query: { before: pageParam, limit: String(HISTORY_PAGE) } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.length === HISTORY_PAGE ? last.at(-1)!.dueAt : undefined),
  });
}

export function useTaskStats(rel: string, taskId: string) {
  return useQuery({ queryKey: ["rel", rel, "stats", taskId], queryFn: () => api<TaskStats>(`/tasks/${taskId}/stats`) });
}

export function useStreaks(rel: string) {
  return useQuery({ queryKey: ["rel", rel, "streaks"], queryFn: () => api<TaskStreak[]>(`/relationships/${rel}/streaks`), staleTime: 60_000 });
}

export function useEditOccurrence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: EditOccurrence }) => api<Occurrence>(`/occurrences/${id}`, { method: "PATCH", body: change }),
    onSuccess: () => invalidate(),
  });
}

// ---- me & relationships

export function useMe(enabled = true) {
  return useQuery({ queryKey: keys.me, queryFn: () => api<Me>("/me"), enabled });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { displayName?: string; weekStart?: WeekStart }) => api<User>("/me", { method: "PATCH", body }),
    // Names appear in member lists and request cards across every relationship.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useSetAvatar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (image: Blob | null) => (image ? api<User>("/me/avatar", { method: "PUT", body: image }) : api<User>("/me/avatar", { method: "DELETE" })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

/** A member's picture as an object URL, cached per version so a new picture refetches. */
export function useAvatarUrl(userId: string, version: string | null) {
  return useQuery({
    queryKey: ["avatar", userId, version],
    queryFn: () => apiObjectUrl(`/users/${userId}/avatar?v=${version}`),
    enabled: version !== null,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useCreateRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string | null; role: Role }) => api<Relationship>("/relationships", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useJoinRelationship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { code: string; role?: Role }) => api<Relationship>("/relationships/join", { method: "POST", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useUpdateRelationship(rel: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<Relationship, "name" | "reschedulePolicy" | "weeklyDelayAllowance" | "subNotes">> & { features?: Partial<Features> }) =>
      api<Relationship>(`/relationships/${rel}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

/** `role` is what the person joining becomes; null lets them choose, undefined uses the server's default. */
export function useCreateInvite(rel: string) {
  return useMutation({ mutationFn: (role?: Role | null) => api<Invite>(`/relationships/${rel}/invites`, { method: "POST", body: role === undefined ? {} : { role } }) });
}

export function useInvitePreview(code: string) {
  return useQuery({ queryKey: ["invite", code], queryFn: () => api<InvitePreview>(`/invites/${encodeURIComponent(code)}`) });
}

// ---- tasks

export function useTasks(rel: string) {
  return useQuery({ queryKey: keys.tasks(rel), queryFn: () => api<Task[]>(`/relationships/${rel}/tasks`) });
}

export function useSaveTask(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<TaskInput> & { active?: boolean } }) =>
      id ? api<Task>(`/tasks/${id}`, { method: "PATCH", body: input }) : api<Task>(`/relationships/${rel}/tasks`, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteTask(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

// ---- occurrences

export function useOccurrences(rel: string, from: string, to: string) {
  return useQuery({
    queryKey: keys.occurrences(rel, from, to),
    queryFn: () => api<Occurrence[]>(`/relationships/${rel}/occurrences`, { query: { from, to } }),
  });
}

export function useCompleteOccurrence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, noteMd }: { id: string; noteMd?: string }) => api<Occurrence>(`/occurrences/${id}/complete`, { method: "POST", body: noteMd ? { noteMd } : {} }),
    onSuccess: () => invalidate(),
  });
}

export function useUndoComplete(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api<Occurrence>(`/occurrences/${id}/undo`, { method: "POST", body: {} }),
    onSuccess: () => invalidate(),
  });
}

export function useReviewOccurrence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, approve, noteMd }: { id: string; approve: boolean; noteMd?: string }) =>
      api<Occurrence>(`/occurrences/${id}/review`, { method: "POST", body: { approve, ...(noteMd ? { noteMd } : {}) } }),
    onSuccess: () => invalidate(),
  });
}

export function useReschedule(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RescheduleInput }) => api<RescheduleResult>(`/occurrences/${id}/reschedule`, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useRescheduleDay(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (input: RescheduleDayInput) =>
      api<{ applied: boolean; groupId: string; requests: RescheduleRequest[]; occurrences: Occurrence[] }>(`/relationships/${rel}/reschedules/day`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => invalidate(),
  });
}

export function usePendingReschedules(rel: string) {
  return useQuery({
    queryKey: keys.reschedules(rel),
    queryFn: () => api<RescheduleRequest[]>(`/relationships/${rel}/reschedules`, { query: { status: "requested" } }),
  });
}

export function useDecideReschedule(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api<{ request: RescheduleRequest; occurrence: Occurrence | null; requests: RescheduleRequest[]; occurrences: Occurrence[] }>(`/reschedules/${id}/decide`, {
        method: "POST",
        body: { approve },
      }),
    onSuccess: () => invalidate(),
  });
}

// ---- points

export function useLedger(rel: string) {
  return useQuery({ queryKey: keys.ledger(rel), queryFn: () => api<LedgerEntry[]>(`/relationships/${rel}/ledger`) });
}

export function useBalances(rel: string) {
  return useQuery({ queryKey: keys.balances(rel), queryFn: () => api<Balance[]>(`/relationships/${rel}/balances`) });
}

export function useAdjustPoints(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (body: { userId: string; delta: number; note: string }) => api<LedgerEntry>(`/relationships/${rel}/ledger/adjust`, { method: "POST", body }),
    onSuccess: () => invalidate(),
  });
}

export function useRedeemReward(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api(`/rewards/${id}/redeem`, { method: "POST" }),
    onSuccess: () => invalidate(),
  });
}

// ---- rewards, consequences, rules, notes

export function useLibrary<K extends LibraryKind>(rel: string, kind: K, enabled = true) {
  return useQuery({
    queryKey: keys.library(rel, kind),
    queryFn: () => api<LibraryTypes[K]["item"][]>(`/relationships/${rel}/${kind}`),
    enabled,
  });
}

export function useSaveLibraryItem<K extends LibraryKind>(rel: string, kind: K) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: Partial<LibraryTypes[K]["input"]> }) =>
      id
        ? api<LibraryTypes[K]["item"]>(`/${kind}/${id}`, { method: "PATCH", body: input })
        : api<LibraryTypes[K]["item"]>(`/relationships/${rel}/${kind}`, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** Saves a drag-to-reorder of rules or protocols, showing the new order right away. */
export function useReorder(rel: string, kind: "rules" | "protocols") {
  const qc = useQueryClient();
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (items: { id: string }[]) => api(`/relationships/${rel}/${kind}/order`, { method: "PUT", body: { ids: items.map((i) => i.id) } }),
    onMutate: (items) => {
      qc.setQueryData(
        keys.library(rel, kind),
        items.map((item, i) => ({ ...item, position: i + 1 })),
      );
    },
    onSettled: () => invalidate(),
  });
}

export function useAssignConsequence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: AssignConsequenceInput }) => api<Task>(`/consequences/${id}/assign`, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteLibraryItem(rel: string, kind: LibraryKind) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api(`/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}
