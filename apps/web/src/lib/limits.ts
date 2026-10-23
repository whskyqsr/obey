import type { LimitAnswer, LimitItem, LimitList, LimitRating } from "../api/types";

/** The five answers, best to worst. The colours mean the same thing in light and dark themes. */
export const RATINGS: { value: LimitRating; label: string; color: string }[] = [
  { value: "love", label: "Love it", color: "#2E7D5B" },
  { value: "like", label: "Like it", color: "#8DB255" },
  { value: "curious", label: "Curious", color: "#E8B83A" },
  { value: "soft", label: "Soft limit", color: "#E07B3C" },
  { value: "hard", label: "Hard limit", color: "#B3261E" },
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

/** Draws the side-by-side chart (or one person's) to a PNG, for saving or sharing. */
export async function chartImage(list: LimitList, people: { userId: string; name: string }[], dark: boolean): Promise<Blob> {
  const groups = byCategory(list.items).map(([category, items]) => ({
    category,
    items: items.filter((i) => people.some((p) => list.people.find((x) => x.userId === p.userId)?.answers?.[i.key]?.rating)),
  }));
  const shown = groups.filter((g) => g.items.length);
  const cols = 3;
  const colW = 420;
  const row = 30;
  const pad = 24;
  const heights = shown.map((g) => 56 + g.items.length * row + 12);
  const colHeights = Array<number>(cols).fill(0);
  const placed = shown.map((g, i) => {
    const c = colHeights.indexOf(Math.min(...colHeights));
    const y = colHeights[c]!;
    colHeights[c]! += heights[i]! + pad;
    return { g, x: pad + c * (colW + pad), y: 110 + y };
  });
  const width = pad + cols * (colW + pad);
  const height = 110 + Math.max(...colHeights, 0) + pad;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const fg = dark ? "#F1DEDA" : "#231918";
  const muted = dark ? "#D8C2BE" : "#534341";
  ctx.fillStyle = dark ? "#1A1110" : "#FFF8F6";
  ctx.fillRect(0, 0, width, height);
  const font = (size: number, weight = 400) => `${weight} ${size}px Roboto, system-ui, sans-serif`;
  ctx.fillStyle = fg;
  ctx.font = font(28, 500);
  ctx.fillText("Limits", pad, 48);
  ctx.font = font(15);
  ctx.fillStyle = muted;
  ctx.fillText(people.map((p) => p.name).join(" and "), pad, 74);
  // Legend, right-aligned on the title row.
  let lx = width - pad;
  ctx.font = font(14);
  for (const r of [...RATINGS].reverse()) {
    const w = ctx.measureText(r.label).width;
    lx -= w;
    ctx.fillStyle = fg;
    ctx.fillText(r.label, lx, 48);
    lx -= 22;
    dot(ctx, lx + 7, 43, r.color);
    lx -= 18;
  }
  for (const { g, x, y } of placed) {
    ctx.fillStyle = dark ? "#271D1C" : "#FDEDEA";
    roundRect(ctx, x, y, colW, 56 + g.items.length * row, 16);
    ctx.fillStyle = fg;
    ctx.font = font(17, 500);
    ctx.fillText(g.category, x + 18, y + 32);
    ctx.font = font(12, 500);
    ctx.fillStyle = muted;
    people.forEach((p, i) => ctx.fillText(p.name.charAt(0).toUpperCase(), x + colW - 30 - (people.length - 1 - i) * 34 - 4, y + 32));
    g.items.forEach((item, n) => {
      const cy = y + 62 + n * row;
      ctx.fillStyle = fg;
      ctx.font = font(15);
      ctx.fillText(clip(ctx, item.title, colW - 40 - people.length * 34), x + 18, cy + 5);
      people.forEach((p, i) => {
        const r = list.people.find((q) => q.userId === p.userId)?.answers?.[item.key]?.rating;
        const cx = x + colW - 26 - (people.length - 1 - i) * 34;
        if (r) dot(ctx, cx, cy, ratingOf(r).color);
        else ring(ctx, cx, cy, muted);
      });
    });
  }
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

function dot(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.fill();
}
function ring(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 7, 0, Math.PI * 2);
  ctx.stroke();
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
function clip(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}
