# Mockup status

Every Letters mockup against the build. Mockups are in `/mnt/project-files/mockups/redesign-2026-11/`. Side-by-side sheets from the last sweep are in `build/sweep/` there.

- **Matched**: the build matches the mockup's layout, type, controls and copy.
- **Close**: small, named differences.
- **Not matched**: needs a pass.
- **Not compared**: the sweep couldn't reach that state with the local seed data.

Update this table in the same PR that changes a screen. Android follows the web column when the same PR did both. It's only compile-checked in CI, so it has never been seen running.

Last full sweep: 2026-11-24, web at 390px and 1440px, local seed data.

| Area | Mockups | Phone (web <1024 + Android) | Desktop (web ≥1024) | What differs |
|---|---|---|---|---|
| Today, submissive | 01, 02, 10, 11, 41 | Close | Close (#114) | Phone: the partner's quoted word only shows when there is one. Desktop: the right column is the partner, their last journal entry, this week's numbers and what's coming up, without boxes. |
| Today, Dominant | 03, 12, desktop 13 | Close | Close (#114) | Desktop right column matches. The header has a "+ New" button where the mockup shows an "N new task" key hint (the hints sit under the list). The streak counts days with nothing missed. |
| Task page, history | 15, 57 | Close (#114) | Close (#114) | Back link reads "Back" because the page opens from several places; mockup says "‹ Today". Comments open from "Add a word" instead of always showing. Android has no "This week" diamond row yet. |
| New task / editor | 04, 52–55, desktop 14 | Close | Close | Sentence builder with tappable parts, inline option panels, Also chips, How often sheet, desktop preview and next three. Quick deadlines live in the time panel rather than mockup 55's separate sheet. Android edits the title in a panel (no inline field in a sentence), has no reward picker or "Next" dates line (both were missing before), and there's no "Save as draft" anywhere because drafts don't exist. |
| + menu | 17 | Not compared | — | |
| Week | 09, desktop 16 | Matched (#106) | Close (#114) | Desktop shows the date range beside the arrows. The mockup puts it as a small line above the title. |
| Month | 13 | Close | Close | Serif dates, one diamond per day, an accent bar for plans, the chosen day filled in ink, and the day as hairline rows (beside the month on desktop). Plans everywhere now use an accent rule and "Kitten's plan" instead of a colour per person; the colour key is gone. The phone header keeps the week/month icon instead of the mockup's "‹ Week" link. |
| Plan editor, clashes | 14, 58 | Not compared | Not compared | |
| Us | 08 | Close | Close | The Safe call button only shows for submissives and switches (correct). On desktop the "Your dynamic" button stretches the full width. |
| All tasks | 56 | Close | Close | The right column shows an hourglass icon where the mockup has words ("14 day streak", "paused"). The "From a kit" filter is missing. |
| Rewards | 05, 59–62, desktop 18 | Matched (#111) | Matched (#111) | |
| Consequences | 29, 63, 64 | Matched (#111) | Matched | |
| Rules | 06, 69 | Close (#108) | Close | Missing the "Agreed by both… version" line and the footer: broken this month · See the log · Propose a change. |
| Protocols tab | 65 | Matched (#108) | Matched | |
| Protocol page | 66 | Matched | Matched | "‹ Protocols", pencil and ⋯ (Delete), serif title and body, "Spells out rule iii" line, and Broken this month from the rule log. Editing is Cancel / Save with the Letters editor. |
| Rule log | 67, 68 | Matched (#112) | Matched | |
| Notes | 28, 70, 72, desktop 20 | Matched (#110, fixes in #114) | Matched | |
| Journal | 07, 71, desktop 15 | Close (#114) | Close (#114) | Partner replies are quoted under entries (the latest one). Desktop reads one entry with "Earlier" and "Write tonight's entry" beside it; search, mood chart and edit/reply are small icons over the entry. The phone header keeps the Notes/Journal switch. |
| Limits | 24, 73 | Close (#114) | Close (#114) | Pills by "You both want", "Worth talking about" and "Off the table", then a diamond table (love filled, like half, curious open, soft accent outline, hard filled accent) with a one-line key the mockup doesn't show. Filling in is one item at a time; "Previous" sits beside "Skip". The saved image is the same diamond table. |
| Agreement | 23, 74, 75 | Close (#114) | Close (#114) | The open proposal sits in one box with Agree / Ask for changes, then "What changed" (added text highlighted, removed struck through) and an "Unchanged" line. Sections are eyebrows over serif text, signatures are hairline rows, Versions has Review / Read. The editor is Cancel · Propose version N · Send. The empty state is just the two start buttons. |
| Scenes, aftercare | 21, 44, 76, 77 | Not matched | Not matched | The aftercare plan should sit at the top of Scenes. The Aftercare page uses cards. The empty state has an explainer. |
| Chastity | 27, 78, 79, 96 | Not compared | Not compared | Seed data has nobody locked. The empty state is fine. |
| Location, places, curfew | 22, 47, 80–82 | Not matched | Not matched | Cards and explainers. The mockup has a map, curfew and places as hairline sections, and a pause icon. Curfew's form wasn't reachable because seed data has no Home place. |
| Stats | 26 | Not matched | Not matched | Cards and charts. The mockup has three serif numbers, by-task bars and a points line. |
| Monthly review | 25, 83 | Not matched | Not matched | Cards. The mockup has a "Looking back on …" title, diamond question rows and a mood line. |
| Kits | 84–86 | Close | Close | The "Yours" section and the add-from-a-link-or-code row are missing. |
| Safe call | 20, 42, 43 | Not compared | Not compared | |
| Your dynamic | 30, 48, 88 | Matched (#113) | Matched | |
| Settings, Features | 18, 19, 89–91, desktop 19 | Matched (#114) | Matched (#114) | |
| Sign-in, onboarding, invites | 31–38 | Not compared | Not compared | |
| App lock, proof terms, reports | 39, 92, 93, desktop 17 | Not compared | Not compared | |
| Android notifications, widgets | android 11, 12 | Not compared | — | |
