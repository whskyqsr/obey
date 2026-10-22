import { randomInt, randomUUID } from "node:crypto";
import { type ApplyKitResult, type Kit, type KitItem, SHARE_CODE_ALPHABET, applyKit, kitInput, kitPatch, normalizeShareCode, starterKits } from "@obey/contracts";
import { addDays, localDate } from "@obey/recurrence";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { consequences, kits, protocols, rewards, rules, taskSeries } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { membership, requireManager } from "../services/access.js";
import { materializeSeries } from "../services/scheduling.js";

/** Plenty for anyone's own library; stops a runaway client filling the table. */
const MAX_KITS = 100;

const toKit = (k: typeof kits.$inferSelect): Kit => ({
  id: k.id,
  title: k.title,
  description: k.description,
  items: k.items,
  shareCode: k.shareCode,
  createdAt: k.createdAt.toISOString(),
  updatedAt: k.updatedAt.toISOString(),
});

const newShareCode = () => Array.from({ length: 6 }, () => SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)]).join("");

/** The picked items plus what they lean on: a task's reward and consequence, a protocol's rule. */
function withDependencies(all: KitItem[], picked: KitItem[]) {
  const keys = new Set(picked.map((i) => i.key));
  for (const i of picked) for (const k of [i.consequenceKey, i.rewardKey, i.ruleKey]) if (k) keys.add(k);
  return all.filter((i) => keys.has(i.key));
}

/**
 * Starter kits are a fixed catalog anyone can read. A Dominant can also save a kit from their own dynamic: a copy of
 * the tasks, rules, protocols, rewards and consequences they pick, theirs alone, which they can add to any dynamic
 * they manage and share by a code.
 */
export const kitRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;
  const horizon = (zone: string) => addDays(localDate(deps.now(), zone), deps.materializeDays);

  app.get("/kits", async () => starterKits);

  /** Adds the chosen items of a kit to a dynamic, linking tasks to the rewards and consequences added with them. */
  async function applyItems(req: { body: unknown; user: { id: string } }, relationshipId: string, items: KitItem[]): Promise<ApplyKitResult> {
    await requireManager(db, relationshipId, req.user.id);
    const body = applyKit.parse(req.body);
    const picked = withDependencies(items, body.items ? items.filter((i) => body.items!.includes(i.key)) : items);
    const of = (kind: KitItem["kind"]) => picked.filter((i) => i.kind === kind);
    const tasks = of("task");
    if (tasks.length) {
      if (!body.assigneeId) throw new HttpError(400, "pick who the tasks are for");
      if (!(await membership(db, relationshipId, body.assigneeId))) throw new HttpError(400, "assignee is not in this relationship");
    }

    return db.transaction(async (tx) => {
      const counts = { tasks: 0, rules: 0, protocols: 0, rewards: 0, consequences: 0 };
      const position = async (table: typeof rules | typeof protocols) => {
        const [{ last }] = (await tx
          .select({ last: sql<number>`coalesce(max(${table.position}), 0)::int` })
          .from(table)
          .where(eq(table.relationshipId, relationshipId))) as [{ last: number }];
        return last + 1;
      };
      const ids = new Map<string, string>();
      for (const item of of("rule")) {
        const [r] = await tx
          .insert(rules)
          .values({ relationshipId, title: item.title, bodyMd: item.bodyMd ?? "", category: item.category ?? null, position: await position(rules) })
          .returning();
        ids.set(item.key, r!.id);
        counts.rules++;
      }
      for (const item of of("protocol")) {
        await tx.insert(protocols).values({
          relationshipId,
          title: item.title,
          bodyMd: item.bodyMd ?? "",
          ruleId: (item.ruleKey && ids.get(item.ruleKey)) || null,
          position: await position(protocols),
        });
        counts.protocols++;
      }
      for (const item of of("consequence")) {
        const [c] = await tx
          .insert(consequences)
          .values({ relationshipId, title: item.title, bodyMd: item.bodyMd ?? "", severity: item.severity ?? 1 })
          .returning();
        ids.set(item.key, c!.id);
        counts.consequences++;
      }
      for (const item of of("reward")) {
        const [r] = await tx
          .insert(rewards)
          .values({ relationshipId, title: item.title, bodyMd: item.bodyMd ?? "", cost: item.cost ?? 0, needsApproval: item.needsApproval ?? true, letsOff: item.letsOff ?? false })
          .returning();
        ids.set(item.key, r!.id);
        counts.rewards++;
      }
      // A task whose time has already passed today starts tomorrow, so nothing arrives overdue.
      const now = DateTime.fromJSDate(deps.now()).setZone(body.timezone);
      const startFor = (dueTime?: string) => (body.start === now.toISODate() && dueTime && dueTime <= now.toFormat("HH:mm") ? addDays(body.start, 1) : body.start);
      for (const item of tasks) {
        const [s] = await tx
          .insert(taskSeries)
          .values({
            relationshipId,
            createdBy: req.user.id,
            assigneeId: body.assigneeId!,
            title: item.title,
            bodyMd: item.bodyMd ?? "",
            schedule: { start: startFor(item.dueTime), ...(item.repeat && { rule: { interval: 1, ...item.repeat } }), ...(item.anchor && { anchor: item.anchor }) },
            dueTime: item.dueTime ?? null,
            askMood: item.askMood ?? false,
            asksJournal: item.asksJournal ?? false,
            points: item.points ?? 0,
            missPenalty: item.missPenalty ?? 0,
            proofRequired: item.proofRequired ?? false,
            approvalRequired: item.approvalRequired ?? false,
            graceMinutes: item.graceMinutes ?? 0,
            steps: (item.steps ?? []).map((title) => ({ id: randomUUID(), title })),
            windowMinutes: item.windowMinutes ?? null,
            countMin: item.countMin ?? null,
            countMax: item.countMax ?? null,
            countPer: item.countPer ?? "task",
            reminder: item.reminder ?? "default",
            reminderText: item.reminderText ?? null,
            consequenceId: (item.consequenceKey && ids.get(item.consequenceKey)) || null,
            consequenceDueDays: item.consequenceDueDays ?? 1,
            consequenceDueTime: item.consequenceDueTime ?? null,
            rewardId: (item.rewardKey && ids.get(item.rewardKey)) || null,
            timezone: body.timezone,
          })
          .returning();
        await materializeSeries(tx, s!, horizon(s!.timezone), deps.now());
        counts.tasks++;
      }
      return counts;
    });
  }

  const announce = async (assigneeId: string | undefined, me: string, result: ApplyKitResult) => {
    if (result.tasks && assigneeId && assigneeId !== me) {
      await notifier.send([assigneeId], { title: "Fealty", body: `You have ${result.tasks} new task${result.tasks === 1 ? "" : "s"}`, data: { type: "task_assigned" } });
    }
  };

  const ownKit = async (id: string, userId: string) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw notFound();
    const [k] = await db
      .select()
      .from(kits)
      .where(and(eq(kits.id, id), eq(kits.ownerId, userId)));
    if (!k) throw notFound();
    return k;
  };
  const sharedKitByCode = async (raw: string) => {
    const code = normalizeShareCode(raw);
    const [k] = code ? await db.select().from(kits).where(eq(kits.shareCode, code)) : [];
    if (!k) throw notFound("this kit isn't shared any more");
    return k;
  };

  // Add a starter kit, or one of your own, to a dynamic.
  app.post<{ Params: { id: string; kit: string } }>("/relationships/:id/kits/:kit", async (req, reply) => {
    const starter = starterKits.find((k) => k.id === req.params.kit);
    const items = starter ? starter.items : (await ownKit(req.params.kit, req.user.id)).items;
    const result = await applyItems(req, req.params.id, items);
    await announce((req.body as { assigneeId?: string }).assigneeId, req.user.id, result);
    return reply.status(201).send(result);
  });

  // Add a kit someone shared straight to a dynamic, without saving it first.
  app.post<{ Params: { id: string; code: string } }>("/relationships/:id/shared-kits/:code", async (req, reply) => {
    const k = await sharedKitByCode(req.params.code);
    const result = await applyItems(req, req.params.id, k.items);
    await announce((req.body as { assigneeId?: string }).assigneeId, req.user.id, result);
    return reply.status(201).send(result);
  });

  app.get("/me/kits", async (req) => (await db.select().from(kits).where(eq(kits.ownerId, req.user.id)).orderBy(desc(kits.updatedAt))).map(toKit));

  const ensureRoom = async (userId: string) => {
    const [{ n }] = (await db
      .select({ n: sql<number>`count(*)::int` })
      .from(kits)
      .where(eq(kits.ownerId, userId))) as [{ n: number }];
    if (n >= MAX_KITS) throw new HttpError(400, `you can keep up to ${MAX_KITS} kits; delete one first`);
  };

  // Save a kit from what a dynamic already has. A copy: changing a task later doesn't change the kit.
  app.post<{ Params: { id: string } }>("/relationships/:id/kits", async (req, reply) => {
    const relationshipId = req.params.id;
    await requireManager(db, relationshipId, req.user.id);
    const body = kitInput.parse(req.body);
    await ensureRoom(req.user.id);
    const pick = async <T>(table: typeof rules | typeof protocols | typeof rewards | typeof consequences, ids: string[]) =>
      ids.length
        ? ((await db
            .select()
            .from(table)
            .where(and(eq(table.relationshipId, relationshipId), inArray(table.id, ids)))) as T[])
        : [];
    const series = body.tasks.length
      ? await db
          .select()
          .from(taskSeries)
          .where(
            and(
              eq(taskSeries.relationshipId, relationshipId),
              inArray(taskSeries.id, body.tasks),
              eq(taskSeries.active, true),
              // A curfew and a consequence handed out on its own aren't tasks someone would reuse.
              isNull(taskSeries.curfewUntil),
              isNull(taskSeries.assignedConsequenceId),
            ),
          )
      : [];
    const pickedRules = await pick<typeof rules.$inferSelect>(rules, body.rules);
    // A rule brings the protocols that spell it out.
    const ruleProtocols = pickedRules.length
      ? await db
          .select()
          .from(protocols)
          .where(
            and(
              eq(protocols.relationshipId, relationshipId),
              inArray(
                protocols.ruleId,
                pickedRules.map((r) => r.id),
              ),
            ),
          )
      : [];
    const pickedProtocols = [...ruleProtocols, ...(await pick<typeof protocols.$inferSelect>(protocols, body.protocols)).filter((p) => !ruleProtocols.some((r) => r.id === p.id))];
    const consequenceIds = new Set([...body.consequences, ...series.flatMap((s) => (s.consequenceId ? [s.consequenceId] : []))]);
    const rewardIds = new Set([...body.rewards, ...series.flatMap((s) => (s.rewardId ? [s.rewardId] : []))]);
    const pickedConsequences = await pick<typeof consequences.$inferSelect>(consequences, [...consequenceIds]);
    const pickedRewards = await pick<typeof rewards.$inferSelect>(rewards, [...rewardIds]);

    // Short keys, so a shared kit says nothing about the dynamic it came from.
    const keyOf = new Map<string, string>();
    const key = (prefix: string, id: string) => {
      if (!keyOf.has(id)) keyOf.set(id, `${prefix}${keyOf.size + 1}`);
      return keyOf.get(id)!;
    };
    const text = (s: string) => (s ? { bodyMd: s } : {});
    const items: KitItem[] = [
      ...pickedRules.map((r) => ({ key: key("r", r.id), kind: "rule" as const, title: r.title, ...text(r.bodyMd), ...(r.category && { category: r.category }) })),
      ...pickedProtocols.map((p) => ({
        key: key("p", p.id),
        kind: "protocol" as const,
        title: p.title,
        ...text(p.bodyMd),
        ...(p.ruleId && pickedRules.some((r) => r.id === p.ruleId) && { ruleKey: key("r", p.ruleId) }),
      })),
      ...pickedConsequences.map((c) => ({ key: key("c", c.id), kind: "consequence" as const, title: c.title, ...text(c.bodyMd), severity: c.severity })),
      ...pickedRewards.map((r) => ({
        key: key("w", r.id),
        kind: "reward" as const,
        title: r.title,
        ...text(r.bodyMd),
        cost: r.cost,
        needsApproval: r.needsApproval,
        letsOff: r.letsOff,
      })),
      ...series.map((s): KitItem => {
        const { count: _count, until: _until, ...repeat } = s.schedule.rule ?? { freq: "daily" as const };
        return {
          key: key("t", s.id),
          kind: "task",
          title: s.title,
          ...text(s.bodyMd),
          ...(s.schedule.rule && { repeat }),
          ...(s.schedule.anchor && { anchor: s.schedule.anchor }),
          ...(s.dueTime && { dueTime: s.dueTime }),
          ...(s.askMood && { askMood: true }),
          ...(s.asksJournal && { asksJournal: true }),
          ...(s.points && { points: s.points }),
          ...(s.missPenalty && { missPenalty: s.missPenalty }),
          ...(s.proofRequired && { proofRequired: true }),
          ...(s.approvalRequired && { approvalRequired: true }),
          ...(s.graceMinutes && { graceMinutes: s.graceMinutes }),
          ...(s.steps.length && { steps: s.steps.map((x) => x.title) }),
          ...(s.windowMinutes && { windowMinutes: s.windowMinutes }),
          ...(s.countMin && { countMin: s.countMin }),
          ...(s.countMax && { countMax: s.countMax }),
          ...(s.countPer !== "task" && { countPer: s.countPer }),
          ...(s.reminder !== "default" && { reminder: s.reminder }),
          ...(s.reminderText && { reminderText: s.reminderText }),
          ...(s.consequenceId && { consequenceKey: key("c", s.consequenceId), consequenceDueDays: s.consequenceDueDays }),
          ...(s.consequenceId && s.consequenceDueTime && { consequenceDueTime: s.consequenceDueTime }),
          ...(s.rewardId && { rewardKey: key("w", s.rewardId) }),
        };
      }),
    ];
    if (!items.length) throw new HttpError(400, "pick at least one thing for the kit");
    const [k] = await db.insert(kits).values({ ownerId: req.user.id, title: body.title, description: body.description, items }).returning();
    return reply.status(201).send(toKit(k!));
  });

  app.patch<{ Params: { kitId: string } }>("/kits/:kitId", async (req) => {
    const k = await ownKit(req.params.kitId, req.user.id);
    const body = kitPatch.parse(req.body);
    const items = body.keep
      ? withDependencies(
          k.items,
          k.items.filter((i) => body.keep!.includes(i.key)),
        )
      : k.items;
    if (!items.length) throw new HttpError(400, "a kit needs at least one thing; delete it instead");
    // An item left behind can't point at something removed.
    const left = new Set(items.map((i) => i.key));
    const tidy = items.map((i) => (i.ruleKey && !left.has(i.ruleKey) ? { ...i, ruleKey: undefined } : i));
    const [u] = await db
      .update(kits)
      .set({ title: body.title ?? k.title, description: body.description ?? k.description, items: tidy, updatedAt: deps.now() })
      .where(eq(kits.id, k.id))
      .returning();
    return toKit(u!);
  });

  app.delete<{ Params: { kitId: string } }>("/kits/:kitId", async (req, reply) => {
    const k = await ownKit(req.params.kitId, req.user.id);
    await db.delete(kits).where(eq(kits.id, k.id));
    return reply.status(204).send();
  });

  app.post<{ Params: { kitId: string } }>("/kits/:kitId/share", async (req) => {
    const k = await ownKit(req.params.kitId, req.user.id);
    if (k.shareCode) return toKit(k);
    for (let attempt = 0; ; attempt++) {
      try {
        const [u] = await db.update(kits).set({ shareCode: newShareCode() }).where(eq(kits.id, k.id)).returning();
        return toKit(u!);
      } catch (e) {
        // Two kits drew the same code; draw again.
        if (attempt >= 4 || (e as { code?: string }).code !== "23505") throw e;
      }
    }
  });

  app.delete<{ Params: { kitId: string } }>("/kits/:kitId/share", async (req) => {
    const k = await ownKit(req.params.kitId, req.user.id);
    const [u] = await db.update(kits).set({ shareCode: null }).where(eq(kits.id, k.id)).returning();
    return toKit(u!);
  });

  // What someone with the code sees: the kit, never who made it.
  app.get<{ Params: { code: string } }>("/shared-kits/:code", async (req) => {
    const k = await sharedKitByCode(req.params.code);
    return { code: k.shareCode!, title: k.title, description: k.description, items: k.items };
  });

  // Save a copy of a shared kit to your own kits; later changes to the original don't reach it.
  app.post<{ Params: { code: string } }>("/shared-kits/:code/save", async (req, reply) => {
    const k = await sharedKitByCode(req.params.code);
    await ensureRoom(req.user.id);
    const [copy] = await db.insert(kits).values({ ownerId: req.user.id, title: k.title, description: k.description, items: k.items }).returning();
    return reply.status(201).send(toKit(copy!));
  });
};
