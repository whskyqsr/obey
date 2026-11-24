import type { LimitAnswer, LimitItem, LimitList, LimitRating } from "../api/types";

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

type Answers = Record<string, LimitAnswer>;
const keen = (r: LimitRating | null | undefined) => r === "love" || r === "like";

/**
 * The comparison once both have finished: anything either rated a hard limit is off the table; both loving or liking
 * it is something they both want; and where one is curious or wants to go slow, it's worth a talk.
 */
export function together(items: LimitItem[], a: Answers, b: Answers) {
  const off: LimitItem[] = [];
  const want: LimitItem[] = [];
  const talk: LimitItem[] = [];
  for (const i of items) {
    const x = a[i.key]?.rating;
    const y = b[i.key]?.rating;
    if (x === "hard" || y === "hard") off.push(i);
    else if (keen(x) && keen(y)) want.push(i);
    else if (x && y && (x === "curious" || x === "soft" || y === "curious" || y === "soft")) talk.push(i);
  }
  return { off, want, talk };
}

/** Draws the diamond table (both people's, or one person's) to a PNG in the current theme's colours, for saving or sharing. */
export async function chartImage(list: LimitList, people: { userId: string; name: string }[], _dark: boolean): Promise<Blob> {
  const css = getComputedStyle(document.documentElement);
  const token = (name: string) => css.getPropertyValue(`--md-${name}`).trim();
  const ink = token("on-surface");
  const muted = token("on-surface-variant");
  const line = token("outline-variant");
  const accent = token("primary");
  const paper = token("surface");
  const serif = css.getPropertyValue("--font-serif").trim() || "Georgia, serif";
  const sans = css.getPropertyValue("--font-sans").trim() || "system-ui, sans-serif";
  const answersOf = (id: string) => list.people.find((x) => x.userId === id)?.answers ?? {};
  const groups = byCategory(list.items)
    .map(([category, items]) => ({ category, items: items.filter((i) => people.some((p) => answersOf(p.userId)[i.key]?.rating)) }))
    .filter((g) => g.items.length);
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
  ctx.fillText(people.map((p) => p.name).join(" and "), pad, 118);
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
  for (const { g, x, y } of placed) {
    ctx.font = `400 15px ${sans}`;
    ctx.fillStyle = muted;
    ctx.fillText(g.category, x, y + 20);
    people.forEach((p, i) => {
      const label = p.name.length > 6 ? p.name.charAt(0).toUpperCase() : p.name;
      const cx = x + colW - 20 - (people.length - 1 - i) * 56;
      ctx.textAlign = "center";
      ctx.fillText(label, cx, y + 20);
      ctx.textAlign = "left";
    });
    g.items.forEach((item, n) => {
      const ry = y + 40 + n * row;
      ctx.fillStyle = ink;
      ctx.font = `400 18px ${sans}`;
      ctx.fillText(clip(ctx, item.title, colW - 40 - people.length * 56), x, ry + 26);
      people.forEach((p, i) => {
        const r = answersOf(p.userId)[item.key]?.rating;
        const cx = x + colW - 20 - (people.length - 1 - i) * 56;
        if (r) diamond(ctx, cx, ry + 20, 8, r, { ink, accent });
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
