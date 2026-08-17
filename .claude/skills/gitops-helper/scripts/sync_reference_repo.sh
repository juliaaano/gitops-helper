#!/usr/bin/env bash
# Clone or update git reference repos used by the gitops-helper skill.
# Idempotent: if the destination already exists, it is fetched and reset to
# origin/main instead of re-cloned, so reruns pick up upstream changes.
set -uo pipefail

sync_repo() {
  local url="$1" dest="$2" out status
  if [ -d "$dest" ]; then
    out=$(git -C "$dest" fetch --depth 1 origin main 2>&1 && git -C "$dest" reset --hard origin/main 2>&1)
  else
    out=$(git clone --depth 1 "$url" "$dest" 2>&1)
  fi
  status=$?
  echo "$out"
  return "$status"
}

usage() {
  cat >&2 <<EOF
Usage:
  $0 required <repo_url> <dest_dir>
  $0 optional <dest_prefix> <repo_url> [<repo_url> ...]

  required: syncs a single mandatory repo. Non-zero exit means the caller
            should STOP the skill.
  optional: syncs one or more extra repos to <dest_prefix>-1, -2, ... Failures
            are reported per repo on stderr; the caller should warn and
            continue rather than stop.
EOF
  exit 2
}

[ $# -ge 1 ] || usage
mode="$1"; shift

case "$mode" in
  required)
    [ $# -eq 2 ] || usage
    sync_repo "$1" "$2"
    exit $?
    ;;
  optional)
    [ $# -ge 2 ] || usage
    prefix="$1"; shift
    i=1
    for url in "$@"; do
      dest="${prefix}-${i}"
      if sync_repo "$url" "$dest"; then
        echo "OK: $dest <- $url"
      else
        echo "WARN: failed to sync $url into $dest" >&2
      fi
      i=$((i + 1))
    done
    exit 0
    ;;
  *)
    usage
    ;;
esac
