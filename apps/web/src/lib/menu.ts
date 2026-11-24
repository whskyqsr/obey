import { createContext, useContext, type ReactNode } from "react";

/**
 * What the app shell gives every page header. Null outside the shell, where headers show only their title.
 */
export interface Menu {
  /**
   * What leads the title line on phones: the dynamic switcher on Today, Week and Us, or a way back to Us on the pages
   * reached from it. Desktop has the sidebar instead.
   */
  lead: "switcher" | "back" | null;
  /** Where the back lead goes: the page this one was opened from, or Us. */
  back?: { label: string; go(): void };
  /** Opens the safe-word sheet; set for subs and switches, who get its button on every page header. */
  safeWord?(): void;
  /** Opens the invite sheet; set when someone is on their own (solo mode). */
  invite?(): void;
  /** Shown under every page header, such as an open safe call, so the title never moves. */
  banner?: ReactNode;
}

export const MenuContext = createContext<Menu | null>(null);
export const useMenu = () => useContext(MenuContext);
