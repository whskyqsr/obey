# Obey: product and technical plan

Obey is an Android and web app for D/s couples (and polycules) to run tasks, rules, rituals, rewards and
consequences together. It follows Obedience's core loop closely and fixes the things that hold it back.

Status: stack confirmed by Jake on 2026-10-16. "Every other 3 days" meant every 3 days. Notes: the editor is the main complaint.

## 1. What we're fixing in Obedience

| Gripe | Obey's answer |
| --- | --- |
| Dated Material design | Material 3 / Material You throughout: dynamic color from the wallpaper on Android 12+, a seed-color theme on web, dark mode, edge-to-edge, large-screen layouts. |
| No rescheduling of recurring tasks | Every occurrence can be delayed (+1h, +24h, custom) or given a new deadline, for **this one** or **this and following**. Subs can request an extension; the Dom approves or declines. |
| Inflexible recurrence | Every N days/weeks/months/years, chosen weekdays every N weeks, "2nd Tuesday" / "last day of the month", on/off cycles (3 on, 4 off), and "N days after I last did it" (completion-anchored). |
| Notes format | Markdown notes with checklists, photos, tags, pinning, per-note visibility and links to tasks/rules; a separate journal with prompts and mood. (See 3.6; Jake's specific dislikes would sharpen this.) |

From public reviews of Obedience, these also hurt users and are cheap to get right from day one: points that drift
or don't match completions, the two phones disagreeing, missing notifications for the sub, auto-ticked habits,
having to delete a habit to change its reward, no calendar view, no app lock, and only one Dom linked at a time.

## 2. Feature list

**MVP (v1)**

1. **Accounts and pairing.** Sign in with Google or email. Invite a partner by link/code. Roles per relationship
   (Dominant, submissive, switch). Multiple relationships per account, so a sub can have two Doms.
2. **Tasks.** One-off or recurring; due time or all-day; optional "available from" window and grace period;
   points value; linked reward or consequence; optional proof (photo or text); notes and comments on each occurrence.
3. **Recurrence** as in section 4, with a plain-English summary ("Every 3 days") and a preview of the next dates.
4. **Rescheduling.** Delay or set a new deadline for one occurrence or the rest of the series. Permission per
   relationship: Dom only, sub may request, or sub gets N free delays per week/month (optionally costing points).
5. **Completion flow.** Sub marks done (with proof if required); Dom can require approval before points post.
   Missed occurrences are marked missed at the deadline + grace, never auto-ticked.
6. **Points ledger.** Every change to a balance is a ledger row (completion, penalty, reward redemption, manual
   adjustment, with who and why), so totals are always explainable and the phones can't disagree.
7. **Rewards and consequences.** Libraries the Dom curates; subs spend points on rewards (optionally needing
   approval); consequences can be auto-applied on a miss or assigned manually, and edited without touching tasks.
8. **Rules.** A numbered list with categories; log a broken rule, optionally with a consequence.
9. **Today and calendar views.** Today/upcoming list, week and month calendar, history with streaks.
10. **Notes** (3.6) and **limits** (hard/soft/curious list).
11. **Notifications.** Reminder before due, due now, overdue, partner completed, approval needed, extension
    requested. Per-user quiet hours. Both partners get what's relevant to them.
12. **Privacy.** App lock (PIN/biometric), discreet notification text by default, optional discreet icon on Android.

**v1.x, borrowed from other apps**

- **Rituals/protocols** (Kneel): ordered checklists for morning/evening routines with streaks.
- **Check-ins and mood** (Kneel): scheduled check-ins where the sub logs mood and a short note; a history graph.
- **Relationship agreement/contract** (Kneel): values, expectations, limits and safewords in one versioned
  document both partners sign; changes need both to re-sign.
- **Gamification** (SubTasks): streaks, achievements, levels.
- **Monthly review** (Obedience's newest feature): a goal per month and a review of how tasks supported it.
- **Safe-call button:** a one-tap "yellow/red" that notifies the Dom immediately and pauses consequences.

**Later / optional modules:** chat, chastity/lock timer with keyholder approvals (Kneel), view-once photos,
shared custom task templates.

## 3. Proposed stack


| Part | Choice | Why |
| --- | --- | --- |
| Android | Kotlin, Jetpack Compose, Material 3, Hilt, Room (offline cache), WorkManager | Native M3 + dynamic color; Room keeps Today usable offline. |
| Web | TypeScript, React, Vite, TanStack Query/Router, Tailwind with M3 color tokens from `@material/material-color-utilities` | Google's own web components (`@material/web`) have been in maintenance mode, and MUI is Material 2-flavoured, so I'd build M3 styling on tokens rather than adopt a kit. This is my read of the library landscape; worth a quick look before committing. |
| Backend | TypeScript on Node, Fastify, Drizzle ORM, Postgres; a worker process loops every minute (materialise, mark missed, reminders) | Same language as web, shares `@obey/recurrence`. Every job step is idempotent, so no queue is needed yet. |
| Hosting | Railway: one API service, one worker service, one Postgres | As requested. |
| Auth | Firebase Authentication (Google + email link), verified server-side with `firebase-admin` | Same SDK on Android and web; we already need Firebase for push. |
| Push | Firebase Cloud Messaging for Android and web push | One sender for both platforms. |
| Repo | pnpm monorepo: `apps/api` (API and worker entrypoints), `apps/web`, `apps/android`, `packages/recurrence`, `packages/contracts` (zod API schemas) | |

The server is the source of truth for occurrences. Android renders what the API returns and caches it; it does not
run its own copy of the recurrence engine, which avoids two implementations drifting apart.

**Play Store risk (inferred, not verified):** Obedience is listed on Google Play, so the category is allowed, but
user photos as "proof" are a sensitive area under Play's sexual content and UGC policies. Proof photos should
stay private between partners, never be public, and have a report/delete path. We should read the current
policy before shipping that feature.

## 4. Recurrence and rescheduling model

### 4.1 Rule

Stored as JSON on the task series (`packages/recurrence/src/rule.ts`). Close to iCalendar RRULE so it can be
exported, with two additions RRULE can't express cleanly.

```ts
interface Schedule {
  start: "YYYY-MM-DD";            // first possible date (DTSTART)
  rule?: RecurrenceRule;          // absent = one-off
  anchor?: "calendar" | "completion";
}
interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly" | "yearly" | "cycle";
  interval?: number;              // every N units
  byWeekday?: ("MO"|"TU"|"WE"|"TH"|"FR"|"SA"|"SU")[]; // weekly days, or monthly with nth
  byMonthDay?: number[];          // 1..31, or -1 = last day; clamps in short months
  nth?: number;                   // monthly: 1..5 or -1 ("2nd Tue", "last Fri")
  cycleLength?: number; cycleDays?: number[]; // cycle: e.g. 7 and [0,1,2] = 3 on, 4 off
  count?: number; until?: "YYYY-MM-DD";
}
```

Examples: every 3 days = `{freq:"daily", interval:3}`. Every other week on Mon and Thu =
`{freq:"weekly", interval:2, byWeekday:["MO","TH"]}`. Three days after last done =
`{freq:"daily", interval:3}` with `anchor:"completion"`.

Recurrence is evaluated on **local calendar dates** in the series' timezone, then combined with the due time
(`dueInstant`), so DST changes can't move a task to another day.

### 4.2 Tables (Postgres)

```
task_series   id, relationship_id, assignee_id, title, body_md, points, reward_id?, consequence_id?,
              proof_required, schedule jsonb, due_time 'HH:mm' | null, timezone, available_before interval?,
              grace interval, miss_policy ('consequence'|'none'), active, created_by, created_at, updated_at,
              superseded_by? (set when "this and following" splits a series)

occurrence    id, series_id, original_date date,         -- identity, like iCal RECURRENCE-ID
              due_at timestamptz,                         -- current deadline (moved by reschedules)
              status ('pending'|'submitted'|'completed'|'missed'|'excused'|'cancelled'),
              completed_at?, proof_url?, note_md?, reviewed_by?, reviewed_at?
              UNIQUE (series_id, original_date)

reschedule    id, occurrence_id, requested_by, approved_by?, from_due_at, to_due_at,
              scope ('this'|'following'), reason?, status ('requested'|'approved'|'declined'), created_at

points_ledger id, relationship_id, user_id, delta, kind, occurrence_id?, reward_id?, note, created_by, created_at
```

### 4.3 How it runs

- **Materialising.** The worker keeps occurrences generated for the next 14 days for calendar-anchored series
  (`occurrencesBetween`), idempotently via the unique key. Calendar views further out compute dates on the fly.
- **Completion-anchored series** have one pending occurrence at a time. Completing (or excusing) it creates the
  next with `nextAfterCompletion(schedule, localDate(completed_at))`. A miss creates the next from the missed due
  date, so a skipped chore doesn't vanish.
- **Delay this one** (+24h etc.): update that occurrence's `due_at` via `delayDue`, which keeps the wall-clock time
  across DST. `original_date` stays, so regeneration never duplicates or resurrects it. Reminder jobs reschedule.
- **New deadline for this one:** set `due_at` to any instant; same mechanics.
- **This and following:** `splitSeries` caps the old series (`until`/`count`) and starts a new series from the new
  date; future pending occurrences of the old series are cancelled and regenerated from the new one.
- **Missing:** a job at `due_at + grace` marks pending occurrences missed and applies the miss policy.
- **Sub requests:** a `reschedule` row with status `requested` notifies the Dom; approving applies it as above.

### 4.4 What's built

`packages/recurrence` implements all of 4.1 plus `occurrencesBetween`, `nextOccurrence`, `nextAfterCompletion`,
`splitSeries`, `describe`, `validateSchedule`, `dueInstant`, `delayDue` and `localDate`, with tests for
intervals, weekday sets, month-end clamping, nth weekday, leap years, cycles, completion anchoring, splitting,
DST gaps and DST-safe delays. Run `pnpm install && pnpm test`.

## 5. Notes (proposal)

- Markdown body with checklists, headings and inline photos; a toolbar on mobile rather than raw syntax.
- Types: **note** (reference: limits, preferences, aftercare plans) and **journal entry** (dated, optional prompt,
  mood, can be assigned as a task: "journal tonight about…").
- Visibility per note: private, shared, or written by the Dom and visible to the sub.
- Tags, folders, pin, search; link a note to tasks, rules or occurrences; comments and reactions from the partner.
- Edit history so neither partner can silently rewrite a shared entry.

## 6. What I need from Jake

1. **Confirm the stack** in section 3, or say what to change.
2. **"Every other 3 days"**: does that mean every 3 days, every 6 days, or an on/off pattern like 3 on, 3 off?
   All three are supported by the model; I'd like the default picker to match what you meant.
3. **Notes**: what specifically bugs you about Obedience's notes?
4. **Firebase / Google Cloud** (needs your account, I can't create these):
   - Create a Firebase project (this also creates its Google Cloud project). Suggested name `obey`.
   - Enable Authentication with the Google and Email link providers.
   - Add an Android app with the package name we choose (proposal: `app.obey`; it can't change later) and give me
     `google-services.json`. For Google sign-in also add the debug and release SHA-1/SHA-256 fingerprints
     (I'll give you the commands once the Android project exists).
   - Add a Web app and give me its config object, and generate a Web Push (VAPID) key pair under Cloud Messaging.
   - Create a service account key (Project settings → Service accounts → Generate new private key) and add it to
     Railway as a variable, not in chat or the repo.
5. **Railway:** OK for me to create a project `obey` with Postgres, an API service and a worker service?
6. **Domain** for the web app, if you have one in mind.
