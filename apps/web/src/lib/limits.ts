import { limitSentence, type Role } from "@obey/contracts";
import type { LimitAnswer, LimitItem, LimitList, LimitRating, LimitSide } from "../api/types";

/** The five answers, best to worst. Each shows as a diamond: filled, half, open, accent outline, filled accent. */
export const RATINGS: { value: LimitRating; label: string }[] = [
  { value: "love", label: "Love it" },
  { value: "like", label: "Like it" },
  { value: "curious", label: "Curious" },
  { value: "soft", label: "Soft limit" },
  { value: "hard", label: "Hard limit" },
];
export const ratingOf = (r: LimitRating) => RATINGS.find((x) => x.value === r)!;

/** Items grouped by category, in list order. */
export function byCategory(items: LimitItem[]) {
  const groups = new Map<string, LimitItem[]>();
  for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
  return [...groups.entries()];
}

const keen = (r: LimitRating | null | undefined) => r === "love" || r === "like";
export const otherSide = (s: LimitSide): LimitSide => (s === "dom" ? "sub" : "dom");

/** The side someone usually answers on: their role's, or for a switch the side opposite their partner's role. */
export function usualSide(role: Role, partnerRole: Role | undefined): LimitSide {
  if (role === "dominant") return "dom";
  if (role === "submissive") return "sub";
  return partnerRole === "dominant" ? "sub" : "dom";
}

/** One way round for one item, said to you: your answer for your side beside your partner's for theirs. */
export type LimitRow = { item: LimitItem; side: LimitSide; text: string; mine?: LimitAnswer; theirs?: LimitAnswer };

/** What an item says for one side, with the partner's name in it; items people added keep their title in front. */
export function rowText(item: LimitItem, side: LimitSide, partnerName: string | undefined) {
  const s = limitSentence(item.sentences[side], partnerName);
  return item.custom ? `${item.title}, ${s.charAt(0).toLowerCase()}${s.slice(1)}` : s;
}

/** Every item both ways round, in category order, your usual side first. */
export function limitRows(list: LimitList, meId: string, partnerId: string | undefined, partnerName: string | undefined, usual: LimitSide): LimitRow[] {
  const me = list.people.find((p) => p.userId === meId)?.sides;
  const them = partnerId ? list.people.find((p) => p.userId === partnerId)?.sides : undefined;
  return byCategory(list.items).flatMap(([, items]) =>
    items.flatMap((item) =>
      [usual, otherSide(usual)].map((side) => ({
        item,
        side,
        text: rowText(item, side, partnerName),
        mine: me?.[side][item.key],
        theirs: them?.[otherSide(side)][item.key],
      })),
    ),
  );
}

export type Verdict = "yes" | "maybe" | "no";
/**
 * Where a row lands once both have finished: a hard limit from either of you is off the table; both loving or liking it
 * is something you both want; and where one of you is curious or wants to go slow, it's worth a talk.
 */
export function verdict(r: LimitRow): Verdict | null {
  const x = r.mine?.rating;
  const y = r.theirs?.rating;
  if (x === "hard" || y === "hard") return "no";
  if (keen(x) && keen(y)) return "yes";
  if (x && y && (x === "curious" || x === "soft" || y === "curious" || y === "soft")) return "maybe";
  return null;
}

/** Draws the rows (both people's answers, or just yours) to a PNG in the current theme's colours, for saving or sharing. */
export async function chartImage(rows: LimitRow[], names: string[]): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(`--md-${name}`).trim();
  const ink = token("on-surface");
  const muted = token("on-surface-variant");
  const line = token("outline-variant");
  const accent = token("primary");
  const paper = token("surface");
  const serif = css.getPropertyValue("--font-serif").trim() || "Georgia, serif";
  const sans = css.getPropertyValue("--font-sans").trim() || "system-ui, sans-serif";
  const both = names.length > 1;
  const shown = rows.filter((r) => r.mine?.rating || (both && r.theirs?.rating));
  const cats = new Map<string, LimitRow[]>();
  for (const r of shown) cats.set(r.item.category, [...(cats.get(r.item.category) ?? []), r]);
  const groups = [...cats.entries()].map(([category, items]) => ({ category, items }));
  const cols = 2;
  const colW = 520;
  const row = 40;
  const pad = 48;
  const heights = groups.map((g) => 40 + g.items.length * row);
  const colHeights = Array<number>(cols).fill(0);
  const top = 150;
  const placed = groups.map((g, i) => {
    const c = colHeights.indexOf(Math.min(...colHeights));
    const y = colHeights[c]!;
    colHeights[c]! += heights[i]! + 32;
    return { g, x: pad + c * (colW + pad), y: top + y };
  });
  const width = pad + cols * (colW + pad);
  const height = top + Math.max(...colHeights, 0) + pad;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = ink;
  ctx.font = `400 56px ${serif}`;
  ctx.fillText("Limits", pad, 86);
  ctx.font = `400 16px ${sans}`;
  ctx.fillStyle = muted;
  ctx.fillText(names.join(" and "), pad, 118);
  // The key, right-aligned on the name line.
  let kx = width - pad;
  for (const r of [...RATINGS].reverse()) {
    const w = ctx.measureText(r.label).width;
    kx -= w;
    ctx.fillStyle = muted;
    ctx.fillText(r.label, kx, 118);
    kx -= 18;
    diamond(ctx, kx + 6, 112, 5, r.value, { ink, accent });
    kx -= 22;
  }
  const colX = (x: number, i: number) => x + colW - 20 - (names.length - 1 - i) * 56;
  for (const { g, x, y } of placed) {
    ctx.font = `400 15px ${sans}`;
    ctx.fillStyle = muted;
    ctx.fillText(g.category, x, y + 20);
    names.forEach((n, i) => {
      ctx.textAlign = "center";
      ctx.fillText(n.length > 6 ? n.charAt(0).toUpperCase() : n, colX(x, i), y + 20);
      ctx.textAlign = "left";
    });
    g.items.forEach((r, n) => {
      const ry = y + 40 + n * row;
      ctx.fillStyle = ink;
      ctx.font = `400 18px ${sans}`;
      ctx.fillText(clip(ctx, r.text, colW - 40 - names.length * 56), x, ry + 26);
      [r.mine, r.theirs].slice(0, names.length).forEach((a, i) => {
        if (a?.rating) diamond(ctx, colX(x, i), ry + 20, 8, a.rating, { ink, accent });
      });
      ctx.strokeStyle = line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, ry + row);
      ctx.lineTo(x + colW, ry + row);
      ctx.stroke();
    });
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

/** A rating's diamond, matching the page: love filled, like half, curious open, soft accent outline, hard filled accent. */
function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rating: LimitRating, c: { ink: string; accent: string }) {
  const color = rating === "soft" || rating === "hard" ? c.accent : c.ink;
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  if (rating === "love" || rating === "hard") {
    ctx.fillStyle = color;
    ctx.fill();
  } else if (rating === "like") {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x - r, y - r, r * 2, r);
    ctx.restore();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
