#!/bin/bash
# deploy-monsterbox-v5.5.sh
# Deploys MonsterBox 5.5 (tag v5.5.0) to selected animatronics (excludes Orlok)

set +e  # Don't exit on errors, handle them individually

# name:ip list (Orlok intentionally omitted per request)
ANIMATRONICS=(
  "mina:192.168.8.140"
  "pumpkinhead:192.168.8.150"
  "sirdragomir:192.168.8.130"
  # Groundbreaker may not have SSH; we still try if reachable
  "groundbreaker:192.168.8.200"
)

VERSION_TAG="v5.5.0"
APP_DIR="/home/remote/MonsterBox"

BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

banner() {
  echo -e "${BLUE}========================================================${NC}"
  echo -e "${BLUE} MonsterBox 5.5 Deployment (${VERSION_TAG})${NC}"
  echo -e "${BLUE}========================================================${NC}"
  echo ""
}

banner

for ANIM in "${ANIMATRONICS[@]}"; do
  NAME="${ANIM%%:*}"
  IP="${ANIM##*:}"

  echo -e "${BLUE}========================================================${NC}"
  echo -e "${BLUE}Deploying to ${NAME} (${IP})...${NC}"
  echo -e "${BLUE}========================================================${NC}"

  # Check connectivity fast
  if ! ping -c 1 -W 2 "$IP" >/dev/null 2>&1; then
    echo -e "${RED}❌ ${NAME} is not reachable at ${IP}${NC}"
    echo ""
    continue
  fi

  echo -e "${GREEN}✅ ${NAME} is reachable${NC}"

  # Stop any existing node server instance
  echo -e "${YELLOW}🛑 Stopping existing MonsterBox on ${NAME}...${NC}"
  ssh -o StrictHostKeyChecking=no remote@"$IP" "pkill -f 'node.*server.js' || true" 2>/dev/null || true
  sleep 2

  # Ensure repo exists
  ssh -o StrictHostKeyChecking=no remote@"$IP" "mkdir -p ${APP_DIR}" || true

  # Fetch and checkout tag
  echo -e "${BLUE}📥 Pulling ${VERSION_TAG} from git...${NC}"
  ssh -o StrictHostKeyChecking=no remote@"$IP" "cd ${APP_DIR} && git fetch --all --tags && git checkout ${VERSION_TAG}" 2>&1 | tail -n 5

  # Install dependencies (idempotent)
  echo -e "${BLUE}📦 Installing dependencies (npm ci)...${NC}"
  ssh -o StrictHostKeyChecking=no remote@"$IP" "cd ${APP_DIR} && npm ci > /tmp/npm-ci.log 2>&1" &
  NPM_PID=$!
  for i in {1..240}; do
    if ! kill -0 $NPM_PID 2>/dev/null; then
      echo -e "${GREEN}   npm ci completed${NC}"
      break
    fi
    if [ $i -eq 240 ]; then
      echo -e "${YELLOW}   npm ci timeout reached; attempting to continue${NC}"
      kill $NPM_PID 2>/dev/null || true
    fi
    sleep 1
  done

  # Start MonsterBox under systemd if present, else nohup
  if ssh -o StrictHostKeyChecking=no remote@"$IP" "systemctl list-unit-files | grep -q monsterbox.service"; then
    echo -e "${BLUE}🚀 Starting MonsterBox via systemd...${NC}"
    ssh -o StrictHostKeyChecking=no remote@"$IP" "sudo systemctl restart monsterbox.service"
  else
    echo -e "${BLUE}🚀 Starting MonsterBox via nohup...${NC}"
    ssh -o StrictHostKeyChecking=no remote@"$IP" "cd ${APP_DIR} && nohup node server.js > /tmp/monsterbox.log 2>&1 < /dev/null &" 2>/dev/null
  fi

  echo "   Waiting 10 seconds for server to start..."
  sleep 10

  # Verify health on default port 3000
  echo -e "${BLUE}🔍 Checking health endpoint...${NC}"
  if curl -s --connect-timeout 5 "http://${IP}:3000/health" | grep -q '"status":"OK"'; then
    echo -e "${GREEN}✅ ${NAME} deployed successfully${NC}"
  else
    echo -e "${YELLOW}⚠️  ${NAME} deployment may have issues - health check failed${NC}"
  fi

  echo ""

done

banner
echo -e "${BLUE}Deployment Complete!${NC}"
echo ""
echo "Running final verification..."
./check-all-animatronics.sh || true
