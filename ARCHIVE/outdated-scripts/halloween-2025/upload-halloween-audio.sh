#!/usr/bin/env bash
# Upload a directory of Halloween audio files to a single animatronic's Audio Library
# Usage: ./scripts/upload-halloween-audio.sh <ip> [directory]

set -euo pipefail

IP=${1:-}
DIR=${2:-"/home/remote/Halloween2025"}

if [[ -z "${IP}" ]]; then
  echo "Usage: $0 <ip> [directory]"
  echo "Example: $0 192.168.8.150 /home/remote/Halloween2025"
  exit 1
fi

if [[ ! -d "${DIR}" ]]; then
  echo "❌ Directory not found: ${DIR}"
  exit 1
fi

echo "🎃 Uploading Halloween audio to ${IP}:3000 from ${DIR}"

# Collect audio files (mp3,wav,ogg,m4a,aac,flac)
mapfile -t FILES < <(find "${DIR}" -maxdepth 1 -type f \( -iname "*.mp3" -o -iname "*.wav" -o -iname "*.ogg" -o -iname "*.m4a" -o -iname "*.aac" -o -iname "*.flac" \) | sort)

if [[ ${#FILES[@]} -eq 0 ]]; then
  echo "⚠️  No audio files found in ${DIR}"
  exit 0
fi

echo "Found ${#FILES[@]} files to upload. Uploading in batches of up to 10..."

UPLOADED=0
ERRORS=0

batch_upload() {
  local -n arr=$1
  local start=$2
  local end=$3

  # Build curl form arguments for up to 10 files per request
  CURL_ARGS=("-sS" "-X" "POST" "http://${IP}:3000/audio-library/api/upload")
  for ((i=start; i<end; i++)); do
    f=${arr[$i]}
    [[ -n "$f" ]] || continue
    CURL_ARGS+=("-F" "audioFiles=@${f}")
  done

  # Optional metadata
  CURL_ARGS+=("-F" "category=halloween")

  local resp
  if ! resp=$(curl "${CURL_ARGS[@]}" 2>&1); then
    echo "❌ Upload request failed for batch ${start}-${end}: ${resp}"
    ((ERRORS++)) || true
    return
  fi

  echo "Response: ${resp}" | jq -r '.message // empty' 2>/dev/null || true

  local uploaded_count
  uploaded_count=$(echo "${resp}" | jq -r '.uploaded | length' 2>/dev/null || echo 0)
  if [[ "${uploaded_count}" =~ ^[0-9]+$ ]]; then
    UPLOADED=$((UPLOADED + uploaded_count))
  fi
}

batch_size=10
total=${#FILES[@]}
for ((start=0; start<total; start+=batch_size)); do
  end=$(( start + batch_size ))
  if (( end > total )); then end=$total; fi
  echo "📤 Uploading files $((start+1))-$end of $total..."
  batch_upload FILES "$start" "$end"
  sleep 1
done

echo ""
echo "✅ Upload complete to ${IP}. Uploaded: ${UPLOADED}, Errors: ${ERRORS}"
