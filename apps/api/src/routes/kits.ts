import { applyKit, starterKits } from "@obey/contracts";
import { addDays, localDate } from "@obey/recurrence";
import { eq, sql } from "drizzle-orm";
import { DateTime } from "luxon";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { protocols, rules, taskSeries } from "../db/schema.js";
import { HttpError, notFound } from "../errors.js";
import { membership, requireManager } from "../services/access.js";
import { materializeSeries } from "../services/scheduling.js";

/** Starter kits: a fixed catalog anyone can read, and a Dominant adds the parts they pick to a dynamic. */
export const kitRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;
  const horizon = (zone: string) => addDays(localDate(deps.now(), zone), deps.materializeDays);

  app.get("/kits", async () => starterKits);

  app.post<{ Params: { id: string; kit: string } }>("/relationships/:id/kits/:kit", async (req, reply) => {
    const relationshipId = req.params.id;
    await requireManager(db, relationshipId, req.user.id);
    const kit = starterKits.find((k) => k.id === req.params.kit);
    if (!kit) throw notFound();
    const body = applyKit.parse(req.body);
    const picked = body.items ? kit.items.filter((i) => body.items!.includes(i.key)) : kit.items;
    const tasks = picked.filter((i) => i.kind === "task");
    if (tasks.length) {
      if (!body.assigneeId) throw new HttpError(400, "pick who the tasks are for");
      if (!(await membership(db, relationshipId, body.assigneeId))) throw new HttpError(400, "assignee is not in this relationship");
    }

    const result = await db.transaction(async (tx) => {
      const counts = { tasks: 0, rules: 0, protocols: 0 };
      const position = async (table: typeof rules | typeof protocols) => {
        const [{ last }] = (await tx
          .select({ last: sql<number>`coalesce(max(${table.position}), 0)::int` })
          .from(table)
          .where(eq(table.relationshipId, relationshipId))) as [{ last: number }];
        return last + 1;
      };
      const ruleIds = new Map<string, string>();
      for (const item of picked.filter((i) => i.kind === "rule")) {
        const [r] = await tx
          .insert(rules)
          .values({ relationshipId, title: item.title, bodyMd: item.bodyMd ?? "", position: await position(rules) })
          .returning();
        ruleIds.set(item.key, r!.id);
        counts.rules++;
      }
      for (const item of picked.filter((i) => i.kind === "protocol")) {
        await tx.insert(protocols).values({
          relationshipId,
          title: item.title,
          bodyMd: item.bodyMd ?? "",
          ruleId: (item.ruleKey && ruleIds.get(item.ruleKey)) || null,
          position: await position(protocols),
        });
        counts.protocols++;
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
            schedule: { start: startFor(item.dueTime), rule: { interval: 1, ...item.repeat! } },
            dueTime: item.dueTime ?? null,
            askMood: item.askMood ?? false,
            timezone: body.timezone,
          })
          .returning();
        await materializeSeries(tx, s!, horizon(s!.timezone), deps.now());
        counts.tasks++;
      }
      return counts;
    });

    if (result.tasks && body.assigneeId !== req.user.id) {
      await notifier.send([body.assigneeId!], { title: "Fealty", body: `You have ${result.tasks} new task${result.tasks === 1 ? "" : "s"}`, data: { type: "task_assigned" } });
    }
    return reply.status(201).send(result);
  });
};
