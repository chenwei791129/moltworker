#!/usr/bin/env bash
# Wrapper script to make podman compatible with wrangler's docker build.
# Strips --provenance flag which podman doesn't support.

args=()
for arg in "$@"; do
  case "$arg" in
    --provenance=*) ;; # skip unsupported flag
    *) args+=("$arg") ;;
  esac
done

exec podman "${args[@]}"
