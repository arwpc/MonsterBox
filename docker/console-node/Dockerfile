# MonsterBox as a hardware-less "console node" (Alpha): the same server the animatronics run,
# in a container so it does not take over the host. Build from the repo root:
#   docker compose -f docker/console-node/compose.yaml up -d --build
FROM node:22-bookworm-slim
# python3: hardware wrappers are spawned only for parts, and a console has none, but a missing
# interpreter should fail a call, not crash a route. curl/iproute2/procps: health checks, ip lookups.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 curl iproute2 procps ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY . .
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -skf https://127.0.0.1:3000/health >/dev/null || exit 1
CMD ["node", "server.js"]
