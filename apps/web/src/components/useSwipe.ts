import { useRef, useState, type MouseEvent, type PointerEvent } from "react";

/** What a swipe does: its word and whether it's the ink one (Done) or a quiet one. */
export type SwipeAction = { label: string; ink?: boolean; run(): void };

const TRIGGER = 96;

/**
 * Touch swipes on a row, like Gmail: right runs `start`, left runs `end`, and the row springs back. Only touch, so a
 * mouse still selects text; vertical scrolling wins until the finger has clearly moved sideways.
 */
export function useSwipe(start: SwipeAction | null, end: SwipeAction | null) {
  const [dx, setDx] = useState(0);
  const from = useRef<{
    x: number;
    y: number;
    id: number;
    sideways: boolean;
  } | null>(null);
  const swiped = useRef(false);
  const last = useRef(0);
  const clamp = (v: number) => Math.max(end ? -160 : 0, Math.min(start ? 160 : 0, v));
  const handlers = {
    onPointerDown(e: PointerEvent) {
      if (e.pointerType !== "touch" || (!start && !end)) return;
      from.current = {
        x: e.clientX,
        y: e.clientY,
        id: e.pointerId,
        sideways: false,
      };
      swiped.current = false;
    },
    onPointerMove(e: PointerEvent) {
      const f = from.current;
      if (!f || f.id !== e.pointerId) return;
      const mx = e.clientX - f.x;
      const my = e.clientY - f.y;
      if (!f.sideways) {
        if (Math.abs(my) > 10) return void (from.current = null);
        if (Math.abs(mx) < 12) return;
        f.sideways = true;
        (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
      }
      last.current = clamp(mx);
      setDx(last.current);
    },
    onPointerUp() {
      const f = from.current;
      from.current = null;
      if (!f?.sideways) return;
      swiped.current = true;
      // Read the distance from the ref: the lift can come before React has drawn the last move.
      if (last.current >= TRIGGER) start?.run();
      else if (last.current <= -TRIGGER) end?.run();
      last.current = 0;
      setDx(0);
    },
    onPointerCancel() {
      from.current = null;
      last.current = 0;
      setDx(0);
    },
    // A swipe that ends over the row's link shouldn't also open the task.
    onClickCapture(e: MouseEvent) {
      if (swiped.current) {
        swiped.current = false;
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
  return { dx, handlers, shown: dx > 0 ? start : dx < 0 ? end : null };
}
