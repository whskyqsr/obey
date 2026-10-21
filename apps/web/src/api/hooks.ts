import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { api, apiObjectUrl } from "./client";
import type { DynamicStats, MoodEntry } from "@obey/contracts";
import type {
  AdminReport,
  OccurrenceComment,
  NoteComment,
  NoteRevision,
  DeviceStatus,
  ProofPhoto,
  ReportReason,
  CalendarEvent,
  CalendarEventInput,
  InvitePreview,
  Balance,
  Features,
  EditOccurrence,
  HistoryEntry,
  TaskStats,
  TaskStreak,
  AssignConsequenceInput,
  WeekStart,
  QuietHours,
  NotifyCategory,
  RuleLogEntry,
  SafeCall,
  SafeCalls,
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
  devices: ["me", "devices"] as const,
  tasks: (rel: string) => ["rel", rel, "tasks"] as const,
  occurrences: (rel: string, from: string, to: string) => ["rel", rel, "occurrences", from, to] as const,
  events: (rel: string, from: string, to: string) => ["rel", rel, "events", from, to] as const,
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

export function useMoods(rel: string, days: number) {
  return useQuery({ queryKey: ["rel", rel, "moods", days], queryFn: () => api<MoodEntry[]>(`/relationships/${rel}/moods?days=${days}`), staleTime: 60_000 });
}

export function useStats(rel: string, days: number, userId: string | null) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const who = userId ? `&userId=${userId}` : "";
  return useQuery({
    queryKey: ["rel", rel, "stats", days, userId],
    queryFn: () => api<DynamicStats>(`/relationships/${rel}/stats?days=${days}&zone=${encodeURIComponent(zone)}${who}`),
    staleTime: 60_000,
  });
}

export function useEditOccurrence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, change }: { id: string; change: EditOccurrence }) => api<Occurrence>(`/occurrences/${id}`, { method: "PATCH", body: change }),
    onSuccess: () => invalidate(),
  });
}

/** A Dominant leaves a miss as missed, so it stops needing them. */
export function useConfirmMiss(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api<Occurrence>(`/occurrences/${id}/confirm-miss`, { method: "POST", body: {} }),
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
    mutationFn: (body: { displayName?: string; weekStart?: WeekStart; revealProofs?: boolean; quietHours?: QuietHours | null; mutedNotifications?: NotifyCategory[] }) =>
      api<User>("/me", { method: "PATCH", body }),
    // Names appear in member lists and request cards across every relationship.
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useDevices(enabled = true) {
  return useQuery({ queryKey: keys.devices, queryFn: () => api<DeviceStatus[]>("/me/devices"), enabled });
}

/** Pushes a test notification to every device on the account; resolves with how each went. */
export function useTestPush() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<DeviceStatus[]>("/me/test-push", { method: "POST" }),
    onSuccess: (devices) => qc.setQueryData(keys.devices, devices),
  });
}

export function useAdminReports(all: boolean) {
  return useQuery({ queryKey: ["admin", "reports", all], queryFn: () => api<AdminReport[]>("/admin/reports", { query: all ? { all: "1" } : undefined }) });
}

export function useAdminPhotoUrl(photoId: string, enabled: boolean) {
  return useQuery({ queryKey: ["admin", "photo", photoId], queryFn: () => apiObjectUrl(`/admin/photos/${photoId}`), staleTime: Infinity, enabled });
}

export function useResolveReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, removePhoto }: { id: string; removePhoto: boolean }) => api(`/admin/reports/${id}/resolve`, { method: "POST", body: { removePhoto } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin"] }),
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
    mutationFn: (body: Partial<Pick<Relationship, "name" | "reschedulePolicy" | "weeklyDelayAllowance" | "subNotes" | "dates">> & { features?: Partial<Features> }) =>
      api<Relationship>(`/relationships/${rel}`, { method: "PATCH", body }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

/** Ends the dynamic for everyone in it; the people in `block` can never pair with you again. */
export function useLeaveRelationship(rel: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (block: string[]) => api<Relationship>(`/relationships/${rel}/leave`, { method: "POST", body: { block } }),
    onSuccess: () => qc.invalidateQueries(),
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

// ---- photo proof

export function useAcceptProofTerms() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<User>("/me/proof-terms", { method: "POST", body: { adult: true, rules: true } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.me }),
  });
}

export function useProofPhotos(occurrenceId: string, enabled = true) {
  return useQuery({
    queryKey: ["proof", occurrenceId],
    queryFn: () => api<ProofPhoto[]>(`/occurrences/${occurrenceId}/photos`),
    enabled,
  });
}

/** A photo as an object URL; photos never change, so it's cached until the page goes. */
export function useProofPhotoUrl(photoId: string) {
  return useQuery({ queryKey: ["proof-photo", photoId], queryFn: () => apiObjectUrl(`/photos/${photoId}`), staleTime: Infinity });
}

export function useAddProofPhoto(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ occurrenceId, image }: { occurrenceId: string; image: Blob }) => api<ProofPhoto>(`/occurrences/${occurrenceId}/photos`, { method: "POST", body: image }),
    onSuccess: (p) => invalidate(["proof", p.occurrenceId]),
  });
}

export function useDeleteProofPhoto(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (p: ProofPhoto) => api(`/photos/${p.id}`, { method: "DELETE" }),
    onSuccess: (_r, p) => invalidate(["proof", p.occurrenceId]),
  });
}

export function useReport() {
  return useMutation({
    mutationFn: (body: { subjectId: string; photoId?: string; reason: ReportReason; details?: string }) => api<{ id: string }>("/reports", { method: "POST", body }),
  });
}

// ---- calendar events

export function useEvents(rel: string, from: string, to: string) {
  return useQuery({
    queryKey: keys.events(rel, from, to),
    queryFn: () => api<CalendarEvent[]>(`/relationships/${rel}/events`, { query: { from, to } }),
  });
}

/** Creates an event, or updates it when an id is given. */
export function useSaveEvent(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CalendarEventInput }) =>
      id ? api<CalendarEvent>(`/events/${id}`, { method: "PATCH", body: input }) : api<CalendarEvent>(`/relationships/${rel}/events`, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

/** "That's fine": keep these tasks as they are alongside the plan. */
export function useDismissClashes(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, occurrenceIds }: { id: string; occurrenceIds: string[] }) => api<CalendarEvent>(`/events/${id}/dismiss`, { method: "POST", body: { occurrenceIds } }),
    onSuccess: () => invalidate(),
  });
}

export function useDeleteEvent(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api(`/events/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

export function useCompleteOccurrence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, noteMd, mood, journal }: { id: string; noteMd?: string; mood?: number; journal?: { title: string; bodyMd: string } }) =>
      api<Occurrence>(`/occurrences/${id}/complete`, { method: "POST", body: { ...(noteMd ? { noteMd } : {}), ...(mood ? { mood } : {}), ...(journal ? { journal } : {}) } }),
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

export function useComments(occurrenceId: string, enabled: boolean) {
  return useQuery({ queryKey: ["comments", occurrenceId], queryFn: () => api<OccurrenceComment[]>(`/occurrences/${occurrenceId}/comments`), enabled });
}

export function useAddComment(rel: string) {
  const invalidate = useInvalidateRel(rel);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ occurrenceId, body }: { occurrenceId: string; body: string }) =>
      api<OccurrenceComment>(`/occurrences/${occurrenceId}/comments`, { method: "POST", body: { body } }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ["comments", c.occurrenceId] });
      invalidate();
    },
  });
}

export function useDeleteComment(rel: string) {
  const invalidate = useInvalidateRel(rel);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: OccurrenceComment) => api(`/comments/${c.id}`, { method: "DELETE" }),
    onSuccess: (_, c) => {
      void qc.invalidateQueries({ queryKey: ["comments", c.occurrenceId] });
      invalidate();
    },
  });
}

/** Earlier versions of a note's title and text, newest first. Refetched when the note changes. */
export function useNoteRevisions(noteId: string, revisionCount: number, enabled: boolean) {
  return useQuery({ queryKey: ["noteRevisions", noteId, revisionCount], queryFn: () => api<NoteRevision[]>(`/notes/${noteId}/revisions`), enabled });
}

export function useNoteComments(noteId: string, enabled = true) {
  return useQuery({ queryKey: ["noteComments", noteId], queryFn: () => api<NoteComment[]>(`/notes/${noteId}/comments`), enabled });
}

export function useAddNoteComment(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: string }) => api<NoteComment>(`/notes/${noteId}/comments`, { method: "POST", body: { body } }),
    onSuccess: (c) => invalidate(["noteComments", c.noteId]),
  });
}

export function useDeleteNoteComment(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (c: NoteComment) => api(`/note-comments/${c.id}`, { method: "DELETE" }),
    onSuccess: (_, c) => invalidate(["noteComments", c.noteId]),
  });
}

export function useReviewOccurrence(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, approve, noteMd, comment }: { id: string; approve: boolean; noteMd?: string; comment?: string }) =>
      api<Occurrence>(`/occurrences/${id}/review`, { method: "POST", body: { approve, ...(noteMd ? { noteMd } : {}), ...(comment?.trim() ? { comment: comment.trim() } : {}) } }),
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

export type PlanRescheduleItem = { occurrenceId: string; action: "move" | "cancel"; dueAt?: string };

/** Sorting out the tasks a plan runs into: each moved or called off, in one go. */
export function usePlanReschedule(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (input: { items: PlanRescheduleItem[]; reason?: string }) =>
      api<{ applied: boolean; groupId: string; requests: RescheduleRequest[]; occurrences: Occurrence[] }>(`/relationships/${rel}/reschedules/plan`, {
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
    mutationFn: ({ id, ...body }: { id: string; approve: boolean; dueAt?: string; item?: boolean }) =>
      api<{ request: RescheduleRequest; occurrence: Occurrence | null; requests: RescheduleRequest[]; occurrences: Occurrence[] }>(`/reschedules/${id}/decide`, {
        method: "POST",
        body,
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

export function useRuleLog(rel: string) {
  return useQuery({ queryKey: ["rel", rel, "rule-log"], queryFn: () => api<RuleLogEntry[]>(`/relationships/${rel}/rule-log`) });
}

export type RuleLogInput = {
  subjectId: string;
  ruleId: string | null;
  protocolId: string | null;
  note: string;
  occurredOn: string;
  consequence?: { consequenceId: string; date: string; dueTime: string | null; timezone: string; approvalRequired: boolean };
};

export function useAddRuleLog(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({ mutationFn: (input: RuleLogInput) => api<RuleLogEntry>(`/relationships/${rel}/rule-log`, { method: "POST", body: input }), onSuccess: () => invalidate() });
}

export function useDeleteRuleLog(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({ mutationFn: (id: string) => api(`/rule-log/${id}`, { method: "DELETE" }), onSuccess: () => invalidate() });
}

/** The open safe call, checked often so a partner sees one soon even without a push. */
export function useSafeCalls(rel: string) {
  return useQuery({ queryKey: ["rel", rel, "safe-calls"], queryFn: () => api<SafeCalls>(`/relationships/${rel}/safe-calls`), refetchInterval: 20_000 });
}

export function useCallSafeWord(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (input: { level: SafeCall["level"]; note: string }) => api<SafeCall>(`/relationships/${rel}/safe-calls`, { method: "POST", body: input }),
    onSuccess: () => invalidate(),
  });
}

export function useClearSafeCall(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({ mutationFn: (id: string) => api<SafeCall>(`/safe-calls/${id}/clear`, { method: "POST" }), onSuccess: () => invalidate() });
}

export function useDeleteLibraryItem(rel: string, kind: LibraryKind) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: (id: string) => api(`/${kind}/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidate(),
  });
}

export type ApplyKitInput = { kit: string; items: string[]; assigneeId?: string; timezone: string; start: string };

export function useApplyKit(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ kit, ...body }: ApplyKitInput) => api<{ tasks: number; rules: number; protocols: number }>(`/relationships/${rel}/kits/${kit}`, { method: "POST", body }),
    onSuccess: () => invalidate(),
  });
}

/** Ticks a ritual step on or off. */
export function useTickStep(rel: string) {
  const invalidate = useInvalidateRel(rel);
  return useMutation({
    mutationFn: ({ id, stepId, done }: { id: string; stepId: string; done: boolean }) => api<Occurrence>(`/occurrences/${id}/steps`, { method: "POST", body: { stepId, done } }),
    onSuccess: () => invalidate(),
  });
}
