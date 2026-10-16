# Obey

A D/s tasks, rules and rewards app for Android and web, with flexible recurring schedules and rescheduling.

See [docs/PLAN.md](docs/PLAN.md) for the product and technical plan.

## Layout

- `apps/api`: Fastify API and background worker (Postgres, deployed on Railway).
- `apps/web`: React web app with Material 3 theming.
- `apps/android`: Kotlin + Jetpack Compose app.
- `packages/recurrence`: recurrence rules, occurrence generation and rescheduling helpers.
- `packages/contracts`: zod request/response schemas shared by the API and web app.

## Development

```sh
pnpm install
pnpm typecheck
pnpm test        # API tests need Postgres; see apps/api/README.md
```
