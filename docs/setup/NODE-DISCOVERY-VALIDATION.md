# Node Discovery — On-Hardware Validation Checklist

The mDNS logic is unit-tested in a hardware-less container, but multicast behavior on a
real WiFi LAN is one of those things you confirm on the metal. This is the first-run
checklist. Budget ~15 minutes.

## Prerequisites (per node)

- [ ] Raspberry Pi OS with **both `avahi-daemon` AND `avahi-utils`** installed, and the daemon
      running (`systemctl is-active avahi-daemon`; `command -v avahi-browse`).
      **These are two different packages and you need both** — the daemon *advertises*,
      `avahi-browse` (in `avahi-utils`) is how the node *discovers*. A node with only the daemon
      is visible to everyone else and blind itself. Both gaps were found live in v9.2.0
      (`avahi-utils` never installed on one node, `avahi-daemon` not running on another); after
      fixing, all three live nodes advertise and see each other.
      Fix: `sudo apt-get install -y avahi-daemon avahi-utils && sudo systemctl enable --now avahi-daemon`
- [ ] All nodes on the **same L2 subnet / WiFi SSID** (mDNS is link-local multicast; it
      does not cross routed VLANs or guest-network isolation).
- [ ] MonsterBox **8.4.1+** deployed (`curl -sk https://localhost:3000/health`).

## 1. Deploy to the whole fleet

```bash
MONSTERBOX_SSH_PASSWORD='…' XI_API_KEY='sk_…' ./scripts/deploy-all.sh --dry-run   # preview
MONSTERBOX_SSH_PASSWORD='…' XI_API_KEY='sk_…' ./scripts/deploy-all.sh             # real
```

- [ ] The summary shows **✓ for every node**. Re-run for any ✗ (inspect its log first).

## 2. Confirm each node is advertising

On any one node (or via SSH):

```bash
cat /etc/avahi/services/monsterbox.service        # id/character/ver TXT records present
avahi-browse -rt _monsterbox._tcp                 # should list EVERY online node
```

- [ ] `avahi-browse` lists all powered-on nodes with their `.local` hostnames and IPs.
- [ ] Each node's `<name>.local` resolves: `ping -c1 orlok.local` (substitute your names).

## 3. Confirm the live registry

Fastest fleet-wide check — the **discovery matrix** (who sees whom), run from anywhere
that can reach the nodes:

```bash
npm run check:discovery
```

- [ ] Every off-diagonal cell is `✓` (each node sees every other node online). A row/column
      of `·` or `?` pinpoints exactly which node isn't being seen, and the summary flags
      unreachable / avahi-down / multicast-blocked nodes.

Or inspect one node directly:

```bash
curl -sk https://localhost:3000/api/orchestration/nodes | jq '.nodes[] | {name,ip,status,source,discovered}'
```

- [ ] Every online peer appears with `"status":"online"`, `"discovered":true`.
- [ ] `avahiAvailable` in the response is `true`.
- [ ] The `ip` shown matches each node's **current DHCP address** (not a stale config value).

## 4. Prove it's dynamic (the money test)

- [ ] **Power a node off** → within ~90 s it flips to `"status":"offline"` in the registry
      (it is kept, not deleted).
- [ ] **Power it back on** → it returns to `online` on its own, no restart of the others.
- [ ] **Force a new DHCP lease** (or reboot the router) so a node's IP changes → the
      registry follows the new IP with no config edit. This is the whole point.

## 5. Orchestration uses discovery

- [ ] From the Orchestration page, a broadcast (e.g. Health Check / Say to All) reaches
      every discovered node — including one whose `config/animatronics.json` `ip` is now
      wrong/blank (discovery overrides it).

## If discovery is empty or partial

- **`avahiAvailable:false`** → avahi-daemon isn't running on that node
  (`sudo systemctl enable --now avahi-daemon`), **or `avahi-utils` is not installed** so
  `avahi-browse` does not exist (`sudo apt-get install -y avahi-utils`). The second case is the
  easy one to miss: the node still advertises itself perfectly and simply cannot see anyone.
- **A node is missing and it is simply powered off** → discovery cannot help. Three of six nodes
  were offline for the whole v9.2.0 session; an absent row is an unpowered node, not a
  discovery fault.
- **Some nodes missing** → almost always the network blocking multicast (guest WiFi, VLAN
  isolation, AP client-isolation, or a managed switch dropping mDNS). Two fixes:
  1. Put all nodes on the same un-isolated SSID/subnet, **or**
  2. Pin the stragglers manually (works regardless of mDNS):
     ```bash
     curl -sk -X POST https://<node>:3000/api/orchestration/nodes/manual \
       -H 'Content-Type: application/json' \
       -d '{"id":5,"name":"Groundbreaker","ip":"<its-ip>","port":3000}'
     ```
- **A node advertises the wrong character** → re-run the advertise step with the right id:
  `sudo MB_ADVERTISE_ID=<id> npm run advertise-node` on that node.

## Optional: lock it down

Set the same `MB_NODE_TOKEN` in every node's **`monsterbox.service` environment** (or a systemd
drop-in) and redeploy. ⚠️ **Not `.env` — the app never loads it**, so a token put there silently
does nothing. After that, only nodes
advertising the matching token hash are trusted — a stray device advertising
`_monsterbox._tcp` won't be auto-added. See [../development/NODE-DISCOVERY.md](../development/NODE-DISCOVERY.md).
