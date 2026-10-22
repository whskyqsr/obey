import { createContext, useContext, type ReactNode } from "react";

/**
 * The phone's navigation menu. Page headers put its button on the title line; once that button scrolls away, the
 * shell floats a copy at the top left. Null outside the app shell, where headers show no button.
 */
export interface Menu {
  open(): void;
  /** Called with the header's button (or null when it unmounts) so the shell knows when it's out of view. */
  track(el: HTMLElement | null): void;
  /** Opens the safe-word sheet; set for subs and switches, who get its button on every page header. */
  safeWord?(): void;
  /** Opens the invite sheet; set when someone is on their own (solo mode). */
  invite?(): void;
  /** Shown under every page header, such as an open safe call, so the title and menu never move. */
  banner?: ReactNode;
}

export const MenuContext = createContext<Menu | null>(null);
export const useMenu = () => useContext(MenuContext);
