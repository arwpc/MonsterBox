#!/bin/bash
# Run the Playwright browser suite on a node where monsterbox.service is running.
#
# The suite spawns its own server on port 3200, but singleInstance.js refuses a
# second MonsterBox process unconditionally — deliberately, because two servers
# on one Pi would both reach for the same GPIO and I2C. So the browser suite and
# the live service cannot coexist, and every attempt to run it on a live node
# fails with "MonsterBox already running (PID …). Exiting."
#
# This stops the service, runs the suite, and restarts the service afterwards —
# including on failure or Ctrl-C, so a node is never left with its service down.
#
# Usage: npm run test:browser:solo [-- --grep "pattern"]

set -u

SERVICE=monsterbox.service
WAS_ACTIVE=0

if systemctl is-active --quiet "$SERVICE"; then
    WAS_ACTIVE=1
fi

restore() {
    local exit_code=$?
    if [ "$WAS_ACTIVE" = "1" ]; then
        echo ""
        echo "==> Restarting $SERVICE"
        sudo systemctl start "$SERVICE"
        # Give it a moment, then report honestly rather than assuming.
        sleep 5
        if systemctl is-active --quiet "$SERVICE"; then
            echo "==> $SERVICE is active again"
        else
            echo "!!! $SERVICE FAILED TO RESTART — check: journalctl -u $SERVICE -n 50"
            exit 1
        fi
    fi
    exit $exit_code
}
trap restore EXIT INT TERM

if [ "$WAS_ACTIVE" = "1" ]; then
    echo "==> Stopping $SERVICE so the test server can bind"
    sudo systemctl stop "$SERVICE"
    # Wait for the PID lock to clear rather than racing it.
    for _ in $(seq 1 20); do
        systemctl is-active --quiet "$SERVICE" || break
        sleep 1
    done
fi

echo "==> Running browser suite"
npx playwright test "$@"
