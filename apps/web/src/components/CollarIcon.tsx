import { cx } from "./ui";

/** Material has no collar, so this is drawn to match its outline icons: a collar with an O-ring. Android's copy is in ui/common/CollarIcon.kt. */
export const COLLAR_PATH = "M3 6.5a9 3.5 0 1 0 18 0a9 3.5 0 1 0 -18 0M3 6.5v3c0 1.9 4 3.5 9 3.5s9-1.6 9-3.5v-3M8.5 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0";

export function CollarIcon({ className, size = 24 }: { className?: string; size?: number }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", className)}
    >
      <path d={COLLAR_PATH} />
    </svg>
  );
}
