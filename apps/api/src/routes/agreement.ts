import {
  type Agreement,
  type AgreementDrift,
  type AgreementLine,
  type AgreementSection,
  type AgreementSectionInput,
  type AgreementVersion,
  agreementFeedbackInput,
  agreementInput,
  allFeatures,
} from "@obey/contracts";
import { and, asc, desc, eq, inArray, lt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import type { Tx } from "../db/index.js";
import { agreementSignatures, agreementVersions, memberships, notes, protocols, relationships, rules, users } from "../db/schema.js";
import { HttpError, forbidden, notFound } from "../errors.js";
import { sendWithWords } from "../notify.js";
import { canManage, requireMember } from "../services/access.js";

type Row = typeof agreementVersions.$inferSelect;
const OPEN = ["proposed", "changes_requested"] as const;

/** Line-by-line diff of [b] against [a], by longest common subsequence. */
export function diffLines(a: string[], b: string[]): AgreementLine[] {
  const n = a.length,
    m = b.length;
  const lcs = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  const out: AgreementLine[] = [];
  let i = 0,
    j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) (out.push({ op: "same", text: b[j++]! }), i++);
    else if (j < m && (i >= n || lcs[i]![j + 1]! >= lcs[i + 1]![j]!)) out.push({ op: "add", text: b[j++]! });
    else out.push({ op: "del", text: a[i++]! });
  }
  return out;
}

const bodyLines = (body: string) =>
  body
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.trim());
const sectionLines = (s: AgreementSectionInput, items: Row["items"]) => (s.kind === "rules" ? items.rules : s.kind === "protocols" ? items.protocols : bodyLines(s.body));

/**
 * The agreement: one page a dynamic writes together and both sign. Either partner proposes a version; it takes effect
 * once everyone in the dynamic has agreed, and the version before stays in force until then. There is at most one
 * open proposal, and editing it makes the editor its proposer.
 */
export const agreementRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const { db, notifier } = deps;

  async function requireAgreement(relationshipId: string, userId: string) {
    const m = await requireMember(db, relationshipId, userId);
    const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
    if (!allFeatures(rel!.features).agreement) throw forbidden("the agreement is switched off for this dynamic");
    return m;
  }

  const others = async (relationshipId: string, me: string) =>
    (await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, relationshipId))).map((m) => m.userId).filter((id) => id !== me);

  /** The agreed version a version is compared against: the latest one numbered before it. */
  async function previousAgreed(tx: Tx, v: Row) {
    const [prev] = await tx
      .select()
      .from(agreementVersions)
      .where(and(eq(agreementVersions.relationshipId, v.relationshipId), lt(agreementVersions.number, v.number), inArray(agreementVersions.status, ["agreed", "superseded"])))
      .orderBy(desc(agreementVersions.number))
      .limit(1);
    return prev ?? null;
  }

  async function versionDto(tx: Tx, v: Row): Promise<AgreementVersion> {
    const prev = await previousAgreed(tx, v);
    const before = new Map((prev?.sections ?? []).map((s) => [s.id, s]));
    const noteIds = v.sections.map((s) => s.noteId).filter((x): x is string => !!x);
    const noteTitles = new Map(
      noteIds.length
        ? (
            await tx
              .select({ id: notes.id, title: notes.title })
              .from(notes)
              .where(and(inArray(notes.id, noteIds), eq(notes.relationshipId, v.relationshipId)))
          ).map((n) => [n.id, n.title])
        : [],
    );
    const sections: AgreementSection[] = v.sections.map((s) => {
      const old = before.get(s.id);
      const lines = old ? diffLines(sectionLines(old, prev!.items), sectionLines(s, v.items)) : sectionLines(s, v.items).map((text) => ({ op: "same" as const, text }));
      const change = !prev ? "same" : !old ? "new" : old.title !== s.title || old.noteId !== s.noteId || lines.some((l) => l.op !== "same") ? "changed" : "same";
      return {
        id: s.id,
        kind: s.kind,
        title: s.title,
        body: s.body,
        noteId: s.noteId,
        noteTitle: s.noteId ? (noteTitles.get(s.noteId) ?? null) : null,
        items: s.kind === "rules" ? v.items.rules : s.kind === "protocols" ? v.items.protocols : [],
        change,
        lines,
      };
    });
    const ids = new Set(v.sections.map((s) => s.id));
    const removed = (prev?.sections ?? []).filter((s) => !ids.has(s.id)).map((s) => s.title);
    const sigs = await tx.select().from(agreementSignatures).where(eq(agreementSignatures.versionId, v.id)).orderBy(asc(agreementSignatures.agreedAt));
    return {
      id: v.id,
      relationshipId: v.relationshipId,
      number: v.number,
      status: v.status,
      sections,
      removed,
      changes: sections.filter((s) => s.change !== "same").length + removed.length + (prev && prev.reviewBy !== v.reviewBy ? 1 : 0),
      reviewBy: v.reviewBy,
      note: v.note,
      proposedBy: v.proposedBy,
      proposedAt: v.proposedAt.toISOString(),
      agreements: sigs.map((s) => ({ userId: s.userId, agreedAt: s.agreedAt.toISOString() })),
      agreedAt: v.agreedAt?.toISOString() ?? null,
      feedback: v.feedbackAt ? { userId: v.feedbackBy, note: v.feedbackNote ?? "", at: v.feedbackAt.toISOString() } : null,
    };
  }

  async function loadVersion(id: string, userId: string) {
    const [v] = await db.select().from(agreementVersions).where(eq(agreementVersions.id, id));
    if (!v) throw notFound();
    await requireAgreement(v.relationshipId, userId);
    return v;
  }

  app.get<{ Params: { id: string } }>("/relationships/:id/agreement", async (req): Promise<Agreement> => {
    await requireAgreement(req.params.id, req.user.id);
    const rows = await db.select().from(agreementVersions).where(eq(agreementVersions.relationshipId, req.params.id)).orderBy(desc(agreementVersions.number));
    const dtos = await Promise.all(rows.map((r) => versionDto(db, r)));
    const agreed = rows.find((r) => r.status === "agreed");
    return {
      drift: agreed ? await driftSince(agreed) : [],
      current: dtos.find((d) => d.status === "agreed") ?? null,
      proposal: dtos.find((d) => (OPEN as readonly string[]).includes(d.status)) ?? null,
      versions: dtos.map(({ id, number, status, proposedBy, proposedAt, agreedAt, changes }) => ({ id, number, status, proposedBy, proposedAt, agreedAt, changes })),
    };
  });

  /**
   * Rules and protocols added or removed since [v] took its snapshot of their titles, which is all the agreement shows of
   * them; a renamed one is both. Order and wording inside them don't count.
   */
  async function driftSince(v: Row): Promise<AgreementDrift[]> {
    const out: AgreementDrift[] = [];
    for (const kind of ["rules", "protocols"] as const) {
      if (!v.sections.some((s) => s.kind === kind)) continue;
      const table = kind === "rules" ? rules : protocols;
      const live = (await db.select({ title: table.title }).from(table).where(eq(table.relationshipId, v.relationshipId))).map((r) => r.title);
      const signed = v.items[kind];
      const left = [...signed];
      for (const title of live) {
        const at = left.indexOf(title);
        if (at >= 0) left.splice(at, 1);
        else out.push({ kind, verb: "added", title });
      }
      for (const title of left) out.push({ kind, verb: "removed", title });
    }
    return out;
  }

  app.get<{ Params: { id: string } }>("/agreement-versions/:id", async (req) => versionDto(db, await loadVersion(req.params.id, req.user.id)));

  /** A first draft with everyone's names in, pointing at a note called Limits if there is one. */
  app.get<{ Params: { id: string } }>("/relationships/:id/agreement/template", async (req) => {
    const relationshipId = req.params.id;
    await requireAgreement(relationshipId, req.user.id);
    const [rel] = await db.select({ features: relationships.features }).from(relationships).where(eq(relationships.id, relationshipId));
    const f = allFeatures(rel!.features);
    const people = await db
      .select({ name: users.displayName, role: memberships.role })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.relationshipId, relationshipId));
    const doms = people.filter((p) => canManage(p.role));
    const subs = people.filter((p) => !canManage(p.role));
    const subName = subs.map((s) => s.name).join(" and ") || "them";
    const limitsNote = (await db.select({ id: notes.id, title: notes.title }).from(notes).where(eq(notes.relationshipId, relationshipId))).find(
      (n) => n.title.trim().toLowerCase() === "limits",
    );
    const sections: AgreementSectionInput[] = [
      { id: "why", kind: "text", title: "Why we're doing this", body: "To give our days some shape and keep the promises we make to each other.", noteId: null },
      ...doms.map((d, i) => ({
        id: `dom-${i + 1}`,
        kind: "text" as const,
        title: `What ${d.name} will do`,
        body: `- Check in with ${subName} every day.\n- Put ${subName}'s wellbeing ahead of any task or rule.\n- Never set a consequence in anger.`,
        noteId: null,
      })),
      ...subs.map((s, i) => ({
        id: `sub-${i + 1}`,
        kind: "text" as const,
        title: `What ${s.name} will do`,
        body: "- Follow our rules and keep up with daily tasks.\n- Say early when something isn't working.",
        noteId: null,
      })),
      { id: "limits", kind: "text", title: "Limits", body: "Anything on a hard limit is off the table, always.", noteId: limitsNote?.id ?? null },
      { id: "safewords", kind: "text", title: "Safewords", body: "Red stops everything. Yellow means slow down and talk. Safe call in Fealty works the same way.", noteId: null },
      ...(f.rules ? [{ id: "rules", kind: "rules" as const, title: "Rules", body: "", noteId: null }] : []),
      ...(f.protocols ? [{ id: "protocols", kind: "protocols" as const, title: "Protocols", body: "", noteId: null }] : []),
    ];
    return { sections };
  });

  /** Proposes a version, or edits the open proposal; whoever sends it has agreed to it. */
  app.post<{ Params: { id: string } }>("/relationships/:id/agreement", async (req, reply) => {
    const relationshipId = req.params.id;
    await requireAgreement(relationshipId, req.user.id);
    const body = agreementInput.parse(req.body);
    if (new Set(body.sections.map((s) => s.id)).size !== body.sections.length) throw new HttpError(400, "section ids must be unique");
    const noteIds = body.sections.map((s) => s.noteId).filter((x): x is string => !!x);
    if (noteIds.length) {
      const found = await db
        .select({ id: notes.id })
        .from(notes)
        .where(and(inArray(notes.id, noteIds), eq(notes.relationshipId, relationshipId)));
      if (found.length !== new Set(noteIds).size) throw new HttpError(400, "a section points to a note that isn't in this dynamic");
    }
    const now = deps.now();
    const { row, created } = await db.transaction(async (tx) => {
      const items = {
        rules: (await tx.select({ title: rules.title }).from(rules).where(eq(rules.relationshipId, relationshipId)).orderBy(asc(rules.position), asc(rules.createdAt))).map(
          (r) => r.title,
        ),
        protocols: (
          await tx.select({ title: protocols.title }).from(protocols).where(eq(protocols.relationshipId, relationshipId)).orderBy(asc(protocols.position), asc(protocols.createdAt))
        ).map((p) => p.title),
      };
      const values = {
        sections: body.sections,
        items,
        reviewBy: body.reviewBy,
        note: body.note,
        proposedBy: req.user.id,
        proposedAt: now,
        status: "proposed" as const,
        feedbackBy: null,
        feedbackNote: null,
        feedbackAt: null,
      };
      const [open] = await tx
        .select()
        .from(agreementVersions)
        .where(and(eq(agreementVersions.relationshipId, relationshipId), inArray(agreementVersions.status, [...OPEN])))
        .for("update");
      let row: Row;
      if (open) {
        [row] = (await tx.update(agreementVersions).set(values).where(eq(agreementVersions.id, open.id)).returning()) as [Row];
        await tx.delete(agreementSignatures).where(eq(agreementSignatures.versionId, open.id));
      } else {
        const [last] = await tx
          .select({ number: agreementVersions.number })
          .from(agreementVersions)
          .where(eq(agreementVersions.relationshipId, relationshipId))
          .orderBy(desc(agreementVersions.number))
          .limit(1);
        [row] = (await tx
          .insert(agreementVersions)
          .values({ relationshipId, number: (last?.number ?? 0) + 1, ...values })
          .returning()) as [Row];
      }
      await tx.insert(agreementSignatures).values({ versionId: row.id, userId: req.user.id, agreedAt: now });
      return { row: (await settle(tx, row, now)) ?? row, created: !open };
    });
    if (row.status !== "agreed") {
      const push = {
        title: "Fealty",
        body: `${req.user.displayName} ${created ? "proposed" : "changed"} version ${row.number} of your agreement`,
        data: { type: "agreement_proposed", versionId: row.id },
      };
      await sendWithWords(db, notifier, await others(relationshipId, req.user.id), push, body.note ? { ...push, body: `${push.body}: “${body.note}”` } : null);
    }
    return reply.status(created ? 201 : 200).send(await versionDto(db, row));
  });

  /** Puts a version in force once everyone in the dynamic has agreed to it; returns it if it did. */
  async function settle(tx: Tx, v: Row, now: Date) {
    const members = await tx.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.relationshipId, v.relationshipId));
    const signed = new Set((await tx.select({ userId: agreementSignatures.userId }).from(agreementSignatures).where(eq(agreementSignatures.versionId, v.id))).map((s) => s.userId));
    if (!members.every((m) => signed.has(m.userId))) return null;
    await tx
      .update(agreementVersions)
      .set({ status: "superseded" })
      .where(and(eq(agreementVersions.relationshipId, v.relationshipId), eq(agreementVersions.status, "agreed")));
    const [done] = await tx.update(agreementVersions).set({ status: "agreed", agreedAt: now }).where(eq(agreementVersions.id, v.id)).returning();
    return done!;
  }

  app.post<{ Params: { id: string } }>("/agreement-versions/:id/agree", async (req) => {
    const v = await loadVersion(req.params.id, req.user.id);
    if (!(OPEN as readonly string[]).includes(v.status)) throw new HttpError(409, "this version isn't waiting for anyone");
    const now = deps.now();
    const done = await db.transaction(async (tx) => {
      await tx.insert(agreementSignatures).values({ versionId: v.id, userId: req.user.id, agreedAt: now }).onConflictDoNothing();
      return settle(tx, v, now);
    });
    await notifier.send(await others(v.relationshipId, req.user.id), {
      title: "Fealty",
      body: done ? `${req.user.displayName} agreed. Version ${v.number} of your agreement is in force` : `${req.user.displayName} agreed to version ${v.number} of your agreement`,
      data: { type: "agreement_agreed", versionId: v.id },
    });
    return versionDto(db, done ?? v);
  });

  app.post<{ Params: { id: string } }>("/agreement-versions/:id/request-changes", async (req) => {
    const v = await loadVersion(req.params.id, req.user.id);
    if (!(OPEN as readonly string[]).includes(v.status)) throw new HttpError(409, "this version isn't waiting for anyone");
    if (v.proposedBy === req.user.id) throw new HttpError(409, "you proposed this version; edit it instead");
    const { note } = agreementFeedbackInput.parse(req.body);
    const now = deps.now();
    const [row] = await db
      .update(agreementVersions)
      .set({ status: "changes_requested", feedbackBy: req.user.id, feedbackNote: note, feedbackAt: now })
      .where(eq(agreementVersions.id, v.id))
      .returning();
    await db.delete(agreementSignatures).where(and(eq(agreementSignatures.versionId, v.id), eq(agreementSignatures.userId, req.user.id)));
    const push = { title: "Fealty", body: `${req.user.displayName} asked for changes to the agreement`, data: { type: "agreement_changes", versionId: v.id } };
    await sendWithWords(db, notifier, await others(v.relationshipId, req.user.id), push, { ...push, body: `${push.body}: “${note}”` });
    return versionDto(db, row!);
  });

  /** Withdraws an open proposal; only whoever proposed it can. */
  app.delete<{ Params: { id: string } }>("/agreement-versions/:id", async (req, reply) => {
    const v = await loadVersion(req.params.id, req.user.id);
    if (!(OPEN as readonly string[]).includes(v.status)) throw new HttpError(409, "only an open proposal can be withdrawn");
    if (v.proposedBy !== req.user.id) throw forbidden("only whoever proposed it can withdraw it");
    await db.delete(agreementVersions).where(eq(agreementVersions.id, v.id));
    return reply.status(204).send();
  });
};
