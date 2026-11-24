# Fealty design rules ("Letters")

These rules are binding for every change to the web or Android UI. The approved mockups are the spec. A screen that doesn't match its mockup is a bug, not a style choice.

## The spec

- Mockups: `/mnt/project-files/mockups/redesign-2026-11/` (`phone-NN-*.png`, `desktop-NN-*.png`, `android-NN-*.png`). `COVERAGE.md` there maps every feature to its screen.
- Status of every mockup against the build: [`design/STATUS.md`](design/STATUS.md). Update it in the same PR as the screen.
- Where a mockup and these rules disagree, these rules win. They hold Jake's later decisions.

## Before you open a PR that touches UI

1. Find the mockup for every screen you changed, at both widths. Phone mockups apply to web under 1024px and to Android. Desktop mockups apply to web at 1024px and wider. If a screen has only a phone mockup, the desktop build still follows these rules and the closest desktop mockup.
2. Screenshot the build at 390px and 1440px wide (web), and check the Android code path for the same screen.
3. Put each mockup beside its build in one image under `/mnt/project-files/mockups/redesign-2026-11/build/` and look at them side by side. Fix what differs: layout, type, spacing, controls, copy, and what's on the screen at all.
4. Update `design/STATUS.md`.
5. Run `node scripts/design-check.mjs`. CI runs it too.

"Phone is done" does not mean the screen is done. A screen is done when phone, desktop and Android all match.

## Look

- Paper `--md-surface` and ink `--md-on-surface`. Oxblood (or the chosen accent) is the only accent. Use theme tokens and never raw colours. The only exceptions are maps, Safe call and the Limits chart, which are allowlisted in the check.
- Instrument Serif is for anything human: page titles, names, dates, quoted words and big numbers. Geist is for controls and labels.
- Use hairlines (`border-outline-variant`, `HorizontalDivider`) instead of cards, filled boxes or bordered panels. Menus, dialogs, sheets and popovers may have a surface and border. List content may not.
- A tappable row between hairlines keeps its text on the page edge, and its hover or pressed highlight reaches 12px (web) or 12dp (Android) past the text on each side, square-cornered so it meets the hairlines, and never sits tight against the words. On web that is `state-layer state-row`; on Android, put `clickable` before the row's padding so the ripple includes it. (Jake, 2026-11-24.)
- The diamond is the checkbox and the active marker: open, filled when done, accent when missed or owed, half when waiting. Don't use dots, ticks or strikethrough for task state.
- A checkbox for picking things (not a task's state) is the diamond too, filled ink with a check drawn inside when ticked, so it can't be read as a status or a rating (Jake, 2026-11-24).
- Form fields are Letters fields: a small label above, the value, and one hairline under it. On web that's the `ui.tsx` fields (`data-field`). On Android it's `LettersField`. Never use a boxed or outlined field, and never put a focus ring around a field.
- Material icons stay. A down arrow appears only where a menu expands.
- No logo inside the app UI.

## Words

- Don't put explanatory lines under a feature name, setting, menu item or section. Keep only text that changes what someone will do, such as a constraint ("4 to 8 digits"), a consequence ("This can't be undone") or a status ("Notifications are blocked for this site").
- "submissive" is always lowercase, even at the start of a sentence.
- A create button reads "+ New", never "+ New rule" or "+ New protocol", so it doesn't change width between tabs.
- Write it the way you'd say it: partners speak in their own words, and requests read as sentences. Dropping words the page already gives never goes as far as dropping the noun a sentence needs: "Felicia has two tasks left today.", not "Felicia has two left today." (Jake, 2026-11-24.)

## Nothing from the old design

No style from the pre-Letters design may show through: no Material filled or tonal containers, elevation, rounded cards, coloured chips, M3 list items with leading icons in boxes, boxed stat tiles, the old pink-tinted M3 palette (#FFF8F6 and friends), or bright status colours. If a screen still has any of these, it is unfinished, even when nobody has written a rule about that exact case.

## One decision, every place

Once Jake decides how something looks or behaves, apply it everywhere the same situation comes up, not just on the screen he pointed at. Record each decision here.

- Create buttons read "+ New" (from Rules/Protocols, 2026-11-23). One per page, in the shared header; the calendar's opens Task / Plan (2026-11-24).
- A consequence's severity shows as five oxblood bolts, filled up to its level, beside the word (Jake, 2026-11-24, bringing back the pre-redesign icons).
- Every page header is the shared one, with its title in the same place whether or not the page has icons (2026-11-24, see Page headers).
- No explainers under names or settings (2026-11-23).
- Empty states are a title, plus a line only when it changes what someone does ("This dynamic has ended."). No hints like "Start one with the + above" and no descriptions of the feature (2026-11-24 audit).
- Write for people who already know their dynamic: everyone who sees a screen is a partner who knows whose plans, tasks and notes are whose, so don't spell out what they already know (2026-11-24).
- Name a person once per page. If the header says whose task or item it is, rows and status lines below don't name them again ("missed", not "Kitten missed") (task page, 2026-11-24).
- Status lines lead with the diamond for their state, as in the mockups (task page, 2026-11-24).
- Form fields are label-above Letters fields with one hairline (2026-11-23).
- Deleting an item returns to its list, never back through history to wherever it was opened from (Notes, 2026-11-23).
- The overflow menu is a horizontal ⋯, as in every mockup (2026-11-24).
- Plans are marked with a rule or line in their person's colour, ink for plans for both of you, and don't name whose they are; a small key under the calendar says which colour is whose. Copy never names what the page already makes clear ("Kitten's plan", "Kitten's side"). Oxblood stays for what's owed or clashing. (Jake, 2026-11-24, reversing Claude's earlier single-accent call for mockup 13.)

Pixel perfection isn't the goal. Once the big gaps in `design/STATUS.md` are closed, there will be a consistency pass across every screen: same headers, same row styles, same buttons and same spacing for the same jobs.

## Page headers

Every main page uses the one shared header: `PageHeader` on web (`apps/web/src/components/ui.tsx`) and `PageHeader` on Android (`ui/common/Components.kt`). Never draw a page's own heading row, title size or New button. Mockups: `/mnt/project-files/mockups/headers/` (Jake approved 2026-11-24).

- The top row (the way back on phones, then the page's icons) is always drawn at the same height, even when it's empty. A page without icons, such as Consequences, has its title in exactly the same place as Rules. (Jake, 2026-11-24: "drift continues to happen", so this is explicit.)
- Then the serif title (52px on desktop), with the one outlined "+ New" level with it on desktop. Pages with more than one kind of new thing (the calendar's task or plan) open a menu from that same "+ New" instead of showing two buttons (Jake, 2026-11-24).
- Then an optional line under the title: a count ("5 rules") or a status. No explainers.
- Then the page's tabs (Rules | Protocols, Notes | Journal), left-aligned under the title, never beside it.
- A section label ("Your list") only appears when a page has more than one section; a page's only list doesn't get one.
- Notes and Journal share one layout: on desktop the list sits in a column with the header, search and rows, and the open note or entry is beside it; on phones both are lists with Notes | Journal tabs. A journal row reads like a note row: "Tue, Nov 24 · good · Jake replied" over the first lines.

## Structure

- Phone tabs are Today, Week and Us, grouped left, plus the raised rounded-square + button. Other pages are reached from contextual header icons (see the mockup README table).
- Desktop has a flat sidebar, with the dynamic switcher where the logo was. Pages with a desktop mockup use its layout. They are not a stretched phone page.
- Web and Android need feature parity. Their layouts follow the same mockup.
- Keep every feature. If a mockup leaves something out, find it a home instead of cutting it, and say so in the PR.
