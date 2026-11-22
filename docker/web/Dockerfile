# syntax=docker/dockerfile:1

# The editor's browser build (pnpm build:web), served at /projects by Caddy.
# CI pushes this image to ghcr.io; the services' Compose stack runs it behind
# its own Caddy, on the account app's origin. Build from the repository root:
#   docker build -f apps/polemic/docker/web/Dockerfile .

FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Every workspace package the editor depends on, dev tools included, needs its manifest here.
COPY packages/tsconfig packages/tsconfig
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/i18n/package.json packages/i18n/
COPY packages/updates/package.json packages/updates/
COPY apps/polemic/package.json apps/polemic/
RUN pnpm install --frozen-lockfile --ignore-scripts --filter @scholarkit/polemic...
COPY packages/i18n packages/i18n
COPY packages/updates packages/updates
COPY apps/polemic apps/polemic
RUN pnpm --filter @scholarkit/polemic build:web

FROM caddy:2-alpine
COPY apps/polemic/docker/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/polemic/dist-web /srv/projects
EXPOSE 80
