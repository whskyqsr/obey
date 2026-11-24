import type { ReactNode } from "react";
import { cx } from "./ui";

/**
 * The page every sign-in and setup screen sits on (mockups 31–38): paper edge to edge, an optional top line (Back,
 * the step, Skip), the serif title, and the actions held at the bottom.
 */
export function FirstRunPage({ top, children, actions, center }: { top?: ReactNode; children: ReactNode; actions?: ReactNode; center?: boolean }) {
  return (
    <div className="flex min-h-dvh justify-center bg-surface px-6 pt-[max(env(safe-area-inset-top),20px)] pb-[max(env(safe-area-inset-bottom),24px)]">
      <div className="flex w-full max-w-md flex-col">
        {top && <div className="flex min-h-10 items-center">{top}</div>}
        <div className={cx("flex flex-1 flex-col", top ? "pt-3" : "pt-16", center && "items-center text-center")}>{children}</div>
        {actions && <div className="mt-10 flex flex-col gap-3">{actions}</div>}
      </div>
    </div>
  );
}

/** The large serif line that opens each of those screens. */
export function FirstRunTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <>
      <h1 className="font-serif text-[44px] leading-[1.05] tracking-[-0.01em] text-on-surface">{children}</h1>
      {sub && <p className="mt-3 text-body-large text-on-surface-variant">{sub}</p>}
    </>
  );
}
