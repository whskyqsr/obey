# @obey/api

Fastify + Drizzle + Postgres API, plus a worker (`src/worker.ts`) that every minute materialises upcoming
occurrences, marks missed ones and sends reminders.

## Run locally

```sh
createdb obey                       # or point DATABASE_URL at any Postgres 16
DEV_AUTH=1 pnpm --filter @obey/api dev
pnpm --filter @obey/api start:worker
```

With `DEV_AUTH=1`, requests can authenticate with `X-Dev-User: <any uuid>` (and optional `X-Dev-Name`).
Never set it in production. Real sign-in uses Firebase ID tokens once `FIREBASE_SERVICE_ACCOUNT` is set.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `DATABASE_URL` | `postgres://obey:obey@localhost:5432/obey` | |
| `PORT` | `3000` | |
| `FIREBASE_SERVICE_ACCOUNT` | unset | Full service-account JSON. Enables Firebase auth and FCM push. |
| `DEV_AUTH` | unset | `1` accepts `X-Dev-User`. Development only. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated. |
| `REMINDER_LEAD_MINUTES` | `30` | |
| `MATERIALIZE_DAYS` | `14` | How far ahead occurrences are created. |

## Schema changes

Edit `src/db/schema.ts`, then `pnpm --filter @obey/api db:generate` and commit the new file in `drizzle/`.
Migrations run automatically when the API or worker starts.

## Tests

Integration tests need a Postgres database they can wipe (`TEST_DATABASE_URL`, default
`postgres://obey:obey@localhost:5432/obey_test`).
