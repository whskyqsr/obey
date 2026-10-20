# Built from the repository root: the API depends on workspace packages.
FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter "@obey/api..."
ENV NODE_ENV=production
WORKDIR /app/apps/api
# The worker service overrides this with `pnpm start:worker`.
CMD ["pnpm", "start"]
