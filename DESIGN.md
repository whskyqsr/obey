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
- The diamond is the checkbox and the active marker: open, filled when done, accent when missed or owed, half when waiting. Don't use dots, ticks or strikethrough for task state.
- Form fields are Letters fields: a small label above, the value, and one hairline under it. On web that's the `ui.tsx` fields (`data-field`). On Android it's `LettersField`. Never use a boxed or outlined field, and never put a focus ring around a field.
- Material icons stay. A down arrow appears only where a menu expands.
- No logo inside the app UI.

## Words

- Don't put explanatory lines under a feature name, setting, menu item or section. Keep only text that changes what someone will do, such as a constraint ("4 to 8 digits"), a consequence ("This can't be undone") or a status ("Notifications are blocked for this site").
- "submissive" is always lowercase, even at the start of a sentence.
- A create button reads "+ New", never "+ New rule" or "+ New protocol", so it doesn't change width between tabs.
- Write it the way you'd say it: partners speak in their own words, and requests read as sentences.

## Structure

- Phone tabs are Today, Week and Us, grouped left, plus the raised rounded-square + button. Other pages are reached from contextual header icons (see the mockup README table).
- Desktop has a flat sidebar, with the dynamic switcher where the logo was. Pages with a desktop mockup use its layout. They are not a stretched phone page.
- Web and Android need feature parity. Their layouts follow the same mockup.
- Keep every feature. If a mockup leaves something out, find it a home instead of cutting it, and say so in the PR.
