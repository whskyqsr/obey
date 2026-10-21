import { cx } from "./ui";

/** The Links mark on its oxblood tile, as on the launcher icon and favicon. Fixed brand colours, whatever theme seed is chosen. */
export const MARK_PATH =
  "M41.75 37.22 L39.11 33.26 L38.06 34.83 L39.66 37.22 L32 48.71 L24.34 37.22 L25.57 35.38 L25.59 35.39 L28.94 30.3 L28.95 30.31 L32 25.74 L35.34 30.74 L36.38 29.17 L32 22.6 L27.99 28.62 L27.96 28.61 L24.62 33.7 L24.6 33.69 L22.25 37.22 L32 51.85 Z M36.01 35.38 L36.04 35.39 L39.38 30.3 L39.4 30.31 L41.75 26.78 L32 12.15 L22.25 26.78 L24.89 30.74 L25.94 29.17 L24.34 26.78 L32 15.29 L39.66 26.78 L38.43 28.62 L38.41 28.61 L35.06 33.7 L35.05 33.69 L32 38.26 L28.66 33.26 L27.62 34.83 L32 41.4 Z";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cx("flex shrink-0 items-center justify-center overflow-hidden bg-[#7d2c1d]", className)}>
      {/* Cropped tighter than the launcher icon, which keeps a safe zone for masks; small tiles need the bigger mark. */}
      <svg viewBox="7 7 50 50" className="size-full">
        <path fill="#ffdad3" fillRule="evenodd" d={MARK_PATH} />
      </svg>
    </span>
  );
}
