# @obey/web

The Obey web app: React 19 + Vite, TanStack Query and Router, Tailwind CSS 4 with Material 3 tokens.

## Run it

```sh
pnpm install                       # from the repo root
cp apps/web/.env.example apps/web/.env
pnpm --filter @obey/web dev        # http://localhost:5173
```

Scripts: `dev`, `build` (to `dist/`), `typecheck` (`tsc --noEmit`), `test` (`vitest run`), `serve` (static
server for `dist/` on `$PORT`, SPA fallback, via sirv-cli).

## Configuration

All variables are read at **build time** (Vite inlines `VITE_*`), so set them before `build`.

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | API base URL. Default `http://localhost:3000`. |
| `VITE_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_PROJECT_ID`, `_APP_ID`, `_MESSAGING_SENDER_ID` | Firebase web config. When set, sign-in is Google via Firebase Auth and requests send `Authorization: Bearer <ID token>`. |
| `VITE_FIREBASE_VAPID_KEY` | Web Push key. With the Firebase config, Settings offers notifications and the app posts the FCM token to `POST /devices`. |

**Dev auth.** Without Firebase config, the sign-in screen asks for a user UUID (or generates one) and every request
sends `X-Dev-User: <uuid>`. The API accepts this only when started with `DEV_AUTH=1`. Use two browsers (or a
private window) with different UUIDs to play both partners.

## How it's built

- `src/theme/tokens.ts` generates light and dark M3 schemes from a seed color with
  `@material/material-color-utilities` (tonal spot) and writes them as `--md-<role>` CSS variables. `src/index.css`
  maps them into Tailwind (`bg-primary`, `text-on-surface-variant`, `bg-surface-container-high`, ...) and defines the
  M3 type scale (`text-title-medium`, `text-label-large`, ...), shape and elevation tokens. The seed and
  light/dark/system mode are chosen in Settings and kept in localStorage.
- `src/components/ui.tsx` holds the M3 pieces: filled/tonal/outlined/text buttons, icon buttons, FAB, cards, chips,
  segmented buttons, outlined text fields, switches, dialogs that become bottom sheets on phones, and a snackbar.
  `AppShell` shows a navigation rail at `md` and up and a bottom navigation bar below it.
- `src/api` wraps the REST API (`client.ts`) and exposes TanStack Query hooks (`hooks.ts`); response types come from
  `@obey/contracts`.
- `src/recurrence/picker.ts` converts the task editor's recurrence picker state to and from the stored `Schedule`
  and previews the next dates using `@obey/recurrence` (`describe`, `occurrences`, `nextAfterCompletion`).
- Notes use TipTap 3 with `@tiptap/markdown`, so the body is edited with a toolbar (headings, bold, italic, strike,
  code, bullet/numbered/check lists, quotes, links, divider) and stored as Markdown.
- `public/firebase-messaging-sw.js` handles push and notification clicks without loading the Firebase SDK.

## Deploying on Railway

No Dockerfile needed. Create a service from this repo with:

- Build command: `pnpm --filter @obey/web build`
- Start command: `pnpm --filter @obey/web serve`
- Variables: `VITE_API_URL` (the API's public URL) and the Firebase variables above.

`serve` listens on `0.0.0.0:$PORT` and falls back to `index.html` for client-side routes. Add the web origin to the
API's CORS allow-list and to Firebase Auth's authorized domains.
