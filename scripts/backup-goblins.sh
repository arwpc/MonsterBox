#!/usr/bin/env bash
# scripts/backup-goblins.sh — capture a restorable snapshot of every Goblin video node
# (OS provisioning, installed app, runtime state, video manifest) plus the MonsterBox-side
# Goblin configuration and this node's own OS provisioning, into backups/<label>/ so the
# whole thing can be committed to git.
#
#   MONSTERBOX_SSH_PASSWORD=... scripts/backup-goblins.sh [label]      # take a snapshot
#   scripts/backup-goblins.sh --verify backups/<label>                  # prove one is intact
#
#   SKIP_MANIFEST=1   reuse an existing videos.manifest.tsv in the target dir instead of
#                     re-hashing every video (the slow part on a Pi 3B+); the fresh name+size
#                     listing is still compared against it and a mismatch is reported.
#   MB_LIVE_REPO=...  take node-local files (data/goblins.json, config/app-config.json) from
#                     this checkout instead of the one the script lives in.
#
# Goblins come from data/goblins.json (the live registry), not from a hardcoded list.
# Video FILES are not copied (~700 MB per Goblin); videos.manifest.tsv records name, size,
# sha256, duration, resolution, fps and codec so a restore can prove the media is identical.
# Wi-Fi PSKs and passwords are redacted; /etc/monsterbox/env is recorded by key name only;
# shell history and SSH keys are never collected.
set -euo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO"

# ---------------------------------------------------------------- verify mode
if [[ "${1:-}" == "--verify" ]]; then
  DIR="${2:?usage: backup-goblins.sh --verify backups/<label>}"
  cd "$DIR"
  fail=0
  if sha256sum --quiet -c MANIFEST.sha256; then
    echo "✅ MANIFEST.sha256: every file present and unmodified ($(wc -l < MANIFEST.sha256) files)"
  else
    echo "❌ MANIFEST.sha256: mismatch"; fail=1
  fi
  for g in goblin-*/; do
    g="${g%/}"
    for must in app/server.js app/src/queueManager.js os/config.txt os/systemd/goblin.service os/dpkg-selections.txt state/health.json videos.manifest.tsv; do
      [[ -s "$g/$must" ]] || { echo "❌ $g: missing or empty $must"; fail=1; }
    done
    if node -e "const h=require('./$g/state/health.json'); if(h.ok!==true) process.exit(1)" 2>/dev/null; then
      echo "✅ $g: health.json parses and reports ok:true, $(($(wc -l < "$g/videos.manifest.tsv")-1)) videos in manifest"
    else
      echo "❌ $g: state/health.json is not a healthy Goblin response"; fail=1
    fi
  done
  for must in monsterbox/goblins.json monsterbox/goblin-playlists.json monsterbox/video-library.json monsterbox/animatronics.json monsterbox/os/config.txt SNAPSHOT.json; do
    [[ -s "$must" ]] || { echo "❌ missing or empty $must"; fail=1; }
  done
  node -e "JSON.parse(require('fs').readFileSync('monsterbox/goblins.json'));JSON.parse(require('fs').readFileSync('monsterbox/goblin-playlists.json'));JSON.parse(require('fs').readFileSync('SNAPSHOT.json'))" \
    && echo "✅ MonsterBox-side JSON parses" || { echo "❌ MonsterBox-side JSON does not parse"; fail=1; }
  if grep -rEl '^[[:space:]]*(psk|password)[[:space:]]*=[[:space:]]*[^<]' os monsterbox/os goblin-*/os 2>/dev/null | grep -q .; then
    echo "❌ an unredacted secret survived"; fail=1
  else
    echo "✅ no unredacted psk/password lines"
  fi
  exit $fail
fi

# ---------------------------------------------------------------- snapshot mode
LABEL="${1:-goblins-$(date +%F)}"
OUT="$REPO/backups/$LABEL"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
: "${MONSTERBOX_SSH_PASSWORD:?MONSTERBOX_SSH_PASSWORD must be set (see docs/setup/ANIMATRONIC-SSH-SETUP.md)}"
export SSHPASS="$MONSTERBOX_SSH_PASSWORD"
SKIP_MANIFEST="${SKIP_MANIFEST:-0}"
LIVE="${MB_LIVE_REPO:-$REPO}"
SSH_USER=remote
SSH_OPTS=(-o StrictHostKeyChecking=accept-new -o ConnectTimeout=8)
mkdir -p "$OUT"

# Everything below runs ON the Goblin as the service user; stdout carries only the tarball.
REMOTE_COLLECT=$(cat <<'REMOTE'
set -u
W="/tmp/goblin-backup.$$"
rm -rf "$W"; mkdir -p "$W/os/systemd" "$W/os/network" "$W/os/display" "$W/os/audio" "$W/os/usr-local-bin" "$W/os/udev" "$W/app" "$W/home"
exec 3>&1 1>&2
S() { sudo -n "$@" 2>/dev/null || true; }
save() { local dest="$1"; shift; "$@" > "$W/$dest" 2>/dev/null || echo "(unavailable: $*)" > "$W/$dest"; }
redact() { sed -E 's/^([[:space:]]*(psk|password|passwd|wep-key[0-9]*|leap-password|pin|secret|token|private-key)[[:space:]]*=).*/\1<REDACTED>/I'; }

save os/os-release.txt cat /etc/os-release
save os/uname.txt uname -a
save os/model.txt sh -c 'tr -d "\0" < /proc/device-tree/model'
save os/hostname.txt hostname
save os/hosts.txt cat /etc/hosts
save os/fstab.txt cat /etc/fstab
save os/timedatectl.txt timedatectl
save os/locale.txt sh -c 'cat /etc/default/locale; echo; cat /etc/default/keyboard'
save os/config.txt cat /boot/firmware/config.txt
save os/cmdline.txt cat /boot/firmware/cmdline.txt
save os/dpkg-selections.txt dpkg --get-selections
save os/apt-manual.txt apt-mark showmanual
save os/versions.txt sh -c 'echo node=$(node -v 2>&1); echo npm=$(npm -v 2>&1); echo mpv=$(mpv --version 2>/dev/null | head -1); echo ffmpeg=$(ffmpeg -version 2>/dev/null | head -1); echo python3=$(python3 --version 2>&1)'
save os/id-remote.txt id
save os/uptime.txt uptime
save os/df.txt df -h
save os/free.txt free -m
save os/throttled.txt vcgencmd get_throttled
save os/lsusb.txt lsusb
save os/ip-addr.txt ip -br addr
save os/cpu-governor.txt cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor

for u in /etc/systemd/system/*.service /etc/systemd/system/*.timer; do [ -f "$u" ] && [ ! -L "$u" ] && cp "$u" "$W/os/systemd/"; done
for d in /etc/systemd/system/*.d; do [ -d "$d" ] && cp -r "$d" "$W/os/systemd/"; done
save os/systemd/enabled-units.txt systemctl list-unit-files --state=enabled --no-legend
save os/systemd/live-state.txt sh -c 'for u in goblin console-blanker monsterbox-goblin goblin-autoqueue goblin-hide-console goblin-xserver lightdm getty@tty1; do printf "%-24s enabled=%s active=%s\n" "$u" "$(systemctl is-enabled $u 2>&1)" "$(systemctl is-active $u 2>&1)"; done'
for f in /usr/local/bin/*; do [ -f "$f" ] && cp "$f" "$W/os/usr-local-bin/"; done

save os/network/nmcli-connections.txt nmcli -t -f NAME,UUID,TYPE,DEVICE,AUTOCONNECT connection show
S sh -c 'for f in /etc/NetworkManager/system-connections/*; do echo "### $f"; cat "$f"; echo; done' | redact > "$W/os/network/system-connections.redacted.txt"
[ -f /etc/wpa_supplicant/wpa_supplicant.conf ] && S cat /etc/wpa_supplicant/wpa_supplicant.conf | redact > "$W/os/network/wpa_supplicant.redacted.txt"
save os/network/nsswitch-hosts.txt grep hosts /etc/nsswitch.conf
S sh -c 'for f in /run/NetworkManager/system-connections/* /etc/netplan/*.yaml; do [ -f "$f" ] && { echo "### $f"; cat "$f"; echo; }; done' | redact > "$W/os/network/runtime-connections.redacted.txt"
save os/network/nmcli-connection-details.txt sh -c 'nmcli -t -f NAME connection show | while read -r n; do echo "### $n"; nmcli -t -f connection.id,connection.type,connection.interface-name,connection.autoconnect,802-11-wireless.ssid,802-11-wireless.hidden,802-11-wireless.band,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns,ipv6.method connection show "$n"; done'

save os/crontab-remote.txt crontab -l
S crontab -l -u root > "$W/os/crontab-root.txt" || true
[ -f /etc/rc.local ] && cp /etc/rc.local "$W/os/rc.local"
for f in /etc/udev/rules.d/*; do [ -f "$f" ] && cp "$f" "$W/os/udev/"; done
S sh -c 'for f in /etc/sudoers.d/*; do echo "### $f"; cat "$f"; done' > "$W/os/sudoers.d.txt"

save os/display/drm-status.txt sh -c 'for c in /sys/class/drm/card*-*; do echo "$(basename $c): $(cat $c/status) modes=$(tr "\n" " " < $c/modes)"; done'
save os/display/kmsprint.txt sh -c 'kmsprint 2>/dev/null | head -60'
save os/audio/aplay-l.txt aplay -l
save os/audio/amixer.txt amixer
[ -d "$HOME/.config/mpv" ] && cp -r "$HOME/.config/mpv" "$W/home/mpv-config"
[ -f "$HOME/.asoundrc" ] && cp "$HOME/.asoundrc" "$W/home/asoundrc"

for f in "$HOME"/*.sh "$HOME"/*.tar.gz "$HOME"/*.json "$HOME"/*.txt "$HOME"/*.md; do [ -f "$f" ] && cp "$f" "$W/home/"; done
save home/listing.txt ls -la "$HOME"
save home/goblin-system-listing.txt sh -c 'find "$HOME/goblin-system" -maxdepth 3 -not -path "*/node_modules*"'
save home/goblin-backup-dirs-listing.txt sh -c 'ls -d "$HOME"/goblin.backup.* 2>/dev/null; for d in "$HOME"/goblin.backup.*; do echo "## $d"; find "$d" -maxdepth 2 -not -path "*/node_modules*"; done'
save home/ssh-authorized-keys-count.txt sh -c 'wc -l < "$HOME/.ssh/authorized_keys"'

tar -C "$HOME/goblin" --exclude=node_modules --exclude=logs --exclude=cache --exclude=media -cf - . | tar -C "$W/app" -xf -
save app/logs-listing.txt ls -la "$HOME/goblin/logs"
for lf in "$HOME"/goblin/logs/*.log; do [ -f "$lf" ] && tail -n 150 "$lf" > "$W/app/log-tail-$(basename "$lf" .log).txt"; done
save os/systemd/journal-goblin.txt sh -c 'journalctl -u goblin -n 40 --no-pager -o short-iso'
save os/systemd/journal-other-goblin-units.txt sh -c 'for u in monsterbox-goblin goblin-autoqueue goblin-hide-console goblin-xserver console-blanker; do echo "### $u"; journalctl -u $u -n 15 --no-pager -o short-iso 2>&1; done'
save app/npm-ls.txt sh -c 'cd "$HOME/goblin" && npm ls --depth=0'

V="$HOME/media/video"
find "$V" -maxdepth 1 -type f -printf '%f\t%s\n' | sort > "$W/videos.listing.tsv"
if [ "${SKIP_MANIFEST:-0}" = 1 ]; then
  echo "(reused from previous snapshot)" > "$W/videos.manifest.tsv"
else
{
  printf 'filename\tbytes\tsha256\tprobe\n'
  find "$V" -maxdepth 1 -type f -printf '%f\n' | sort | while IFS= read -r f; do
    p="$V/$f"; b=$(stat -c %s "$p"); h=$(sha256sum "$p" | cut -d' ' -f1)
    meta=$(ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration -of default=nw=1 "$p" 2>/dev/null | tr '\n' ' ')
    printf '%s\t%s\t%s\t%s\n' "$f" "$b" "$h" "$meta"
  done
} > "$W/videos.manifest.tsv"
fi
save videos.du.txt du -sh "$V"
echo "collected $(find "$W" -type f | wc -l) files on $(hostname)"
tar -C "$W" -czf - . >&3
rm -rf "$W"
REMOTE
)
REMOTE_COLLECT="SKIP_MANIFEST=$SKIP_MANIFEST"$'\n'"$REMOTE_COLLECT"

collect_goblin() {
  local id="$1" name="$2" endpoint="$3"
  local host; host="$(echo "$endpoint" | sed -E 's#^https?://##; s#[:/].*$##')"
  local dir="$OUT/$id" prev=""
  if [[ "$SKIP_MANIFEST" == 1 && -s "$dir/videos.manifest.tsv" ]]; then prev="$(mktemp)"; cp "$dir/videos.manifest.tsv" "$prev"; fi
  rm -rf "$dir"; mkdir -p "$dir/state"
  echo "→ $name ($host): collecting over ssh"
  if ! sshpass -e ssh "${SSH_OPTS[@]}" "$SSH_USER@$host" 'bash -s' <<<"$REMOTE_COLLECT" | tar -C "$dir" -xzf -; then
    echo "❌ $name ($host): ssh collection failed" >&2; return 1
  fi
  if [[ -n "$prev" ]]; then
    if diff -q <(tail -n +2 "$prev" | cut -f1,2) "$dir/videos.listing.tsv" >/dev/null; then
      cp "$prev" "$dir/videos.manifest.tsv"; echo "  $name: video manifest reused (names and sizes unchanged)"
    else
      echo "❌ $name: videos changed since the previous manifest — re-run without SKIP_MANIFEST" >&2
      cp "$prev" "$dir/videos.manifest.PREVIOUS.tsv"; status=1
    fi
    rm -f "$prev"
  fi
  for ep in health api/status queue media api/videos/scan playback-status; do
    local f="$dir/state/$(echo "$ep" | tr '/' '-').json"
    if curl -s --max-time 15 "$endpoint/$ep" > "$f.raw"; then
      node -e "const fs=require('fs');const t=fs.readFileSync('$f.raw','utf8');try{fs.writeFileSync('$f',JSON.stringify(JSON.parse(t),null,2)+'\n')}catch{fs.writeFileSync('$f',t)}" && rm -f "$f.raw"
    else
      echo "(unreachable: $endpoint/$ep)" > "$f"; rm -f "$f.raw"
    fi
  done
  echo "✓ $name ($host): $(find "$dir" -type f | wc -l) files"
}

# ---- Goblins, in parallel, from the live registry
mapfile -t GOBLIN_ROWS < <(node -e "for (const g of require('$LIVE/data/goblins.json')) console.log([g.id,g.name,g.endpoint].join('|'))")
status=0
pids=()
for row in "${GOBLIN_ROWS[@]}"; do
  IFS='|' read -r gid gname gendpoint <<<"$row"
  collect_goblin "$gid" "$gname" "$gendpoint" &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p" || status=1; done

# ---- MonsterBox side: Goblin configuration this node holds
mkdir -p "$OUT/monsterbox/os"
cp "$LIVE/data/goblins.json" "$OUT/monsterbox/goblins.json"
cp data/goblin-playlists.json "$OUT/monsterbox/goblin-playlists.json"
cp data/video-library/library.json "$OUT/monsterbox/video-library.json"
cp config/animatronics.json "$OUT/monsterbox/animatronics.json"
[ -f "$LIVE/config/app-config.json" ] && cp "$LIVE/config/app-config.json" "$OUT/monsterbox/app-config.json"
git ls-tree -r HEAD goblin/ > "$OUT/monsterbox/goblin-repo-tree.txt"
( cd data && sha256sum goblin-videos/* video-library/files/* ) > "$OUT/monsterbox/local-videos.sha256"

# ---- MonsterBox side: this node's own OS provisioning (secrets by key name only)
O="$OUT/monsterbox/os"
lsave() { local dest="$1"; shift; "$@" > "$O/$dest" 2>/dev/null || echo "(unavailable: $*)" > "$O/$dest"; }
lsave os-release.txt cat /etc/os-release
lsave uname.txt uname -a
lsave model.txt sh -c 'tr -d "\0" < /proc/device-tree/model'
lsave hostname.txt hostname
lsave config.txt cat /boot/firmware/config.txt
lsave cmdline.txt cat /boot/firmware/cmdline.txt
lsave dpkg-selections.txt dpkg --get-selections
lsave apt-manual.txt apt-mark showmanual
lsave pip-freeze.txt python3 -m pip freeze
lsave versions.txt sh -c 'echo node=$(node -v); echo npm=$(npm -v); echo python3=$(python3 --version 2>&1); echo monsterbox=$(node -p "require(\"./package.json\").version")'
lsave monsterbox.service.txt systemctl cat monsterbox.service
lsave monsterbox-env-keys.txt sudo -n sh -c 'cut -d= -f1 /etc/monsterbox/env; ls -la /etc/monsterbox'
lsave crontab-remote.txt crontab -l
lsave avahi-services.txt sh -c 'for f in /etc/avahi/services/*; do echo "### $f"; cat "$f"; done'
lsave journald-conf-d.txt sh -c 'for f in /etc/systemd/journald.conf.d/*; do echo "### $f"; cat "$f"; done'
lsave logrotate-monsterbox.txt cat /etc/logrotate.d/monsterbox
lsave wireplumber-etc.txt sh -c 'find /etc/wireplumber -type f | while read f; do echo "### $f"; cat "$f"; done'
lsave wireplumber-home.txt sh -c 'find "$HOME/.config/wireplumber" -type f | while read f; do echo "### $f"; cat "$f"; done'
lsave start-audio.sh cat "$HOME/start-audio.sh"
lsave nmcli-connections.txt nmcli -t -f NAME,UUID,TYPE,DEVICE,AUTOCONNECT connection show
lsave wpctl-status.txt env XDG_RUNTIME_DIR=/run/user/1000 wpctl status
lsave aplay-l.txt aplay -l
lsave arecord-l.txt arecord -l
lsave i2cdetect.txt i2cdetect -y 1
lsave lsusb.txt lsusb
lsave throttled.txt vcgencmd get_throttled
lsave df.txt df -h
lsave free.txt free -m
lsave enabled-units.txt systemctl list-unit-files --state=enabled --no-legend

# ---- index + manifest
node -e "
const fs=require('fs');const out='$OUT';
const goblins=require('./data/goblins.json').map(g=>{
  const d=out+'/'+g.id; const rd=f=>{try{return fs.readFileSync(d+'/'+f,'utf8').trim()}catch{return null}};
  const manifest=rd('videos.manifest.tsv'); const nVideos=manifest?manifest.split('\n').length-1:null;
  return {id:g.id,name:g.name,endpoint:g.endpoint,hostname:rd('os/hostname.txt'),model:rd('os/model.txt'),
    os:(rd('os/os-release.txt')||'').match(/PRETTY_NAME=\"([^\"]+)\"/)?.[1]||null,
    versions:rd('os/versions.txt'),videos:nVideos,videosOnDisk:rd('videos.du.txt'),settings:g.settings,
    files:fs.existsSync(d)?require('child_process').execSync('find '+JSON.stringify(d)+' -type f | wc -l').toString().trim()*1:0};
});
fs.writeFileSync(out+'/SNAPSHOT.json',JSON.stringify({label:'$LABEL',takenAt:'$STAMP',takenOn:require('os').hostname(),
  gitCommit:require('child_process').execSync('git rev-parse HEAD').toString().trim(),
  monsterboxVersion:require('./package.json').version,goblins},null,2)+'\n');
"
( cd "$OUT" && find . -type f ! -name MANIFEST.sha256 -printf '%P\n' | sort | xargs -d '\n' sha256sum > MANIFEST.sha256 )
echo
echo "snapshot: $OUT ($(find "$OUT" -type f | wc -l) files, $(du -sh "$OUT" | cut -f1))"
exit $status
