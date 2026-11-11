#!/usr/bin/env bash
# build-mac.sh — local Mac build gate (macOS adaptation, D3 §4 / D5 §2).
#
# No CI in this repo (2026-11-10 decision): this script IS the pre-release
# gate, run manually in a TERMINAL on the local arm64 Mac (not from inside
# sandboxed agent environments — the brokered-fs shim denies electron-
# builder's staging writes there; problems W11). When CI arrives, this moves
# to a macos-14+ runner unchanged (lessons L1).
#
# Steps (each gates the next; any failure aborts with exit 1):
#   0. environment preflight  — uv present, python provisioned, mirrors set
#   1. darwin shell unit tests — node --test over win_desktop/test
#   2. assemble --platform darwin-arm64 — full payload + its own gates
#      (A1 import smoke / A1b runtime probe / A2 required files / A6 bytecode)
#   3. payload spot checks     — darwin path markers, patch manifest, jw deep
#      file, symlink targets (the B3-2 acceptance items)
#   4. swarm-patches verify    — payload patch chain integrity (f25 lesson)
#   5. electron-builder --mac  — ad-hoc signed DMG+zip smoke (the B3-3
#      acceptance; real Developer ID signing/notarization is B4-1, this gate
#      only proves the packaging chain itself works)
#
# Usage:
#   ./build-mac.sh            # full gate
#   SKIP_EB=1 ./build-mac.sh  # everything except electron-builder (step 5)
#
# Preconditions (the script checks and tells you, it does not provision):
#   - repo built: pnpm build ran at the repo root, services/*/dist exist
#   - .sciencediscovery-data provisioned ON THIS MACHINE (uv venvs with
#     darwin python): the repo's setup scripts do this; assemble sanity-
#     checks every input before copying.
set -euo pipefail

# --- locate the shell root from this script's own location -------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHELL_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO_ROOT="$(cd "$SHELL_ROOT/.." && pwd)"
DATA_DIR="$REPO_ROOT/.sciencediscovery-data"
OUT_DIR="$SHELL_ROOT/build/resources"

step() { printf '\n\033[1;36m[build-mac] %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m[build-mac] FAIL: %s\033[0m\n' "$*" >&2; exit 1; }

# --- 0. environment preflight -----------------------------------------------
step "0. environment preflight"

# Downloads from GitHub releases 502 through some networks; the npmmirror
# mirrors are the verified path (problems W11 — measured both ways).
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_BINARIES_MIRROR="${ELECTRON_BUILDER_BINARIES_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
echo "mirrors: ELECTRON_MIRROR=$ELECTRON_MIRROR"

command -v node >/dev/null 2>&1 || die "node not found on PATH"
echo "node $(node --version)"

# assemble takes the payload's base interpreter from the venv's realpath'd
# pyvenv.cfg home — the data dir must have been provisioned with a darwin
# python (uv-managed) on THIS machine. Missing dir = provision first.
[ -f "$DATA_DIR/envs/sd-services/pyvenv.cfg" ] \
  || die "missing $DATA_DIR/envs/sd-services/pyvenv.cfg — provision the data dir on this Mac first (uv venvs with darwin python), then rerun"
echo "data dir OK: $DATA_DIR"

[ -f "$REPO_ROOT/services/api/dist/server.js" ] \
  || die "missing services/api/dist — run the repo build (pnpm build) first, then rerun"
echo "repo build OK"

# --- 1. darwin shell unit tests ---------------------------------------------
step "1. darwin shell unit tests"
( cd "$SHELL_ROOT" && node --experimental-strip-types --no-warnings --test test/*.test.ts ) \
  || die "shell unit tests failed"
echo "unit tests green"

# --- 2. assemble darwin-arm64 payload ---------------------------------------
step "2. assemble --platform darwin-arm64"
( cd "$SHELL_ROOT" && node scripts/assemble-backend.mjs --platform darwin-arm64 ) \
  || die "assemble-backend failed"
[ -f "$OUT_DIR/version.json" ] || die "assemble produced no version.json"

# --- 3. payload spot checks (B3-2 acceptance) --------------------------------
step "3. payload darwin spot checks"

# 3a. darwin path-family markers: POSIX interpreter layout, no win32
# trampolines/DLLs anywhere in the payload python trees.
[ -x "$OUT_DIR/python/bin/python3" ] || die "3a: missing <payload>/python/bin/python3"
[ -d "$OUT_DIR/python/lib" ]          || die "3a: missing <payload>/python/lib (POSIX stdlib layout)"
if find "$OUT_DIR/envs-template" -name "python.exe" -print -quit | grep -q .; then
  die "3a: win32 python.exe found in envs-template — payload is not darwin-shaped"
fi
if find "$OUT_DIR/python" -name "*.dll" -print -quit | grep -q .; then
  die "3a: win32 runtime DLLs found in bundled python — payload is not darwin-shaped"
fi
echo "3a. darwin path markers OK (bin/python3, lib/, no python.exe/.dll)"

# 3b. patch manifest: the jw tree carries the patch-state json assemble's
# required-files gate just verified; restate it here for the log.
[ -f "$OUT_DIR/backend/jw/.sciencediscovery-patches.json" ] \
  || die "3b: missing payload patch manifest (.sciencediscovery-patches.json)"
echo "3b. patch manifest present"

# 3c. jw deep file + venv python symlink targets rewritten to the RELATIVE
# bundled hop (W10: shipped venv symlinks must not point at build paths).
JW_DEEP="$OUT_DIR/backend/jw/jiuwenswarm/common/config.py"
[ -f "$JW_DEEP" ] || die "3c: missing deep jw file: $JW_DEEP"
for venv in "$OUT_DIR/backend/jw/.venv" "$OUT_DIR/envs-template/sd-services"; do
  [ -e "$venv/bin/python" ] || die "3c: missing $venv/bin/python"
  target="$(readlink "$venv/bin/python" 2>/dev/null || true)"
  [ -n "$target" ] || die "3c: $venv/bin/python is not a symlink — venv shape changed"
  case "$target" in
    ../*python*) ;;   # relative hop at the bundled interpreter — the W10 fix
    *) die "3c: $venv/bin/python -> $target (not a relative bundled hop — W10 regression?)";;
  esac
done
echo "3c. jw deep file + venv python symlinks OK (relative bundled hops)"

# --- 4. swarm-patches verify (f25 lesson: apply/verify double exit 0) --------
step "4. swarm-patches verify (payload patch chain)"
# Direct swarm-patches.py invocation (same as scripts/jiuwenswarm.mjs does):
# verify <target> <tag> over the PAYLOAD's jw tree with the payload's own
# venv python — proves the shipped tree matches the patch manifest.
JW_VENV_PY="$OUT_DIR/backend/jw/.venv/bin/python"
JW_TAG="${JIUWENSWARM_TAG:-workswarm0.2.6}"
if [ -e "$JW_VENV_PY" ]; then
  "$JW_VENV_PY" "$REPO_ROOT/scripts/swarm-patches.py" verify "$OUT_DIR/backend/jw" "$JW_TAG" \
    || die "swarm-patches verify failed on the payload jw tree"
  echo "patch chain verify OK (tag=$JW_TAG)"
else
  die "payload jw venv python missing at $JW_VENV_PY (assemble step should have failed first)"
fi

# --- 5. electron-builder ad-hoc DMG smoke (B3-3 acceptance) -------------------
step "5. electron-builder --mac (ad-hoc DMG+zip smoke)"
if [ "${SKIP_EB:-0}" = "1" ]; then
  echo "SKIP_EB=1 — skipping electron-builder (gate reduced to payload checks)"
else
  # Ad-hoc: no Developer ID identity is wired yet (B4-1); this proves the
  # packaging chain (schema, icon, entitlements, DMG layout, zip) works.
  # Gatekeeper will reject the result for external users — expected, W2-era
  # behaviour documented in D4 §4.
  ( cd "$SHELL_ROOT" && npx electron-builder --mac ) \
    || die "electron-builder --mac failed"
  DMG="$(find "$SHELL_ROOT/release" -maxdepth 1 -name '*.dmg' -print -quit 2>/dev/null || true)"
  [ -n "$DMG" ] || die "no DMG artifact under $SHELL_ROOT/release"
  echo "DMG artifact: $(basename "$DMG")"
  codesign --verify --verbose=2 "$SHELL_ROOT/release/mac-arm64/ScienceDiscovery.app" 2>&1 \
    || die "codesign verify failed on the packed .app"
  echo "codesign verify OK (ad-hoc)"
fi

step "gate passed — payload at $OUT_DIR"
