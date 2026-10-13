# MonsterBox as a hardware-less "console node" (Alpha): the same server the animatronics run,
# in a container so it does not take over the host. Build from the repo root:
#   docker compose -f docker/console-node/compose.yaml up -d --build
#
# Laid out like a Pi (/home/remote/MonsterBox, HOME=/home/remote, ~/yard-theater-logs, America/Chicago)
# and running cron, so /schedule on Alpha manages a real crontab and the cron lines the animatronics use
# (`cd /home/remote/MonsterBox && node scripts/...`) work here verbatim. That is what lets Alpha own the
# fleet's schedule while the animatronics are off.
FROM node:22-bookworm-slim
# python3: hardware wrappers are spawned only for parts, and a console has none, but a missing
# interpreter should fail a call, not crash a route. curl: scheduled scene/wake actions and health
# checks. cron + tzdata: the schedule. iproute2/procps: ip lookups and ps.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 curl iproute2 procps ca-certificates cron tzdata \
 && rm -rf /var/lib/apt/lists/* \
 && ln -sf /usr/share/zoneinfo/America/Chicago /etc/localtime && echo America/Chicago > /etc/timezone \
 && ln -sf /usr/local/bin/node /usr/bin/node \
 && mkdir -p /home/remote/yard-theater-logs
ENV HOME=/home/remote TZ=America/Chicago NODE_ENV=production PORT=3000
WORKDIR /home/remote/MonsterBox
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s CMD curl -skf https://127.0.0.1:3000/health >/dev/null || exit 1
# cron daemonizes; the server is the container's main process.
CMD ["sh", "-c", "cron && exec node server.js"]
