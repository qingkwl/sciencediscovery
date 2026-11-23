#!/usr/bin/env python3
"""Verify-runner: the P0-2 probe collection driver.

Runs every probe in application/scripts/verify/ against a Python
environment (today: the assembled venv payload; after D3: the frozen
onedir). One probe per dynamic import path, per
agent-kb/design/P0-dynamic-paths.md (probe inventory A/B/C).

Design contract (mirrors probe-payload-runtime.py, the A1b single probe
this collection grew out of):

  * Each probe is a module in this directory named verify_<topic>.py
    exposing run() -> None. run() raises on failure; returning None
    means PASS. Probes may print; the runner collects the outcome.
  * The runner exits non-zero if any probe fails, with a per-probe
    PASS/FAIL table on stdout. FAILURE_MODE=hard (default) fails on
    any failure; FAILURE_MODE=soft reports and exits 0 (advisory
    bucket during P0 bring-up, see D3 task P0-3 staged adoption).
  * Ordering: explicit PROBE_ORDER list, not directory listing, so a
    new file does not silently join the build (P0-3 wires this into
    assemble A1b; the collection must be a frozen plan — mirrors the
    CI skill's "no second list beside the tags" rule, a skip is a
    failure, not a pass).
  * Dev-tree awareness: probes that need payload-only invariants (the
    pip-branch-unreachable assertion) check SD_VERIFY_TARGET and
    downgrade to a no-op with a loud SKIP-PAYLOAD-ONLY line on a dev
    tree. A skip that is not payload-only is a failure.

Usage:
    <env-python> application/scripts/verify/run_verify.py [--target venv|dev]

Exit 0 + final VERIFY_OK line = the whole collection passed.
"""

from __future__ import annotations

import importlib
import os
import sys
import traceback
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The frozen plan. Adding a file without adding it here is a collection
# drift bug: run_verify reports unknown files as failures (EMPTY module
# guard, same lesson as the CI catalog).
PROBE_ORDER = [
    "verify_evolve_candidate_runtime",
    "verify_evolve_pip_branch_unreachable",
    "verify_evolve_vendored_runner_path",
    "verify_adapter_sitecustomize_chain",
    "verify_adapter_openjiuwen_metadata",
    "verify_gateway_mcp_config_files",
    "verify_paper_worker_entry",
    "verify_package_presence_matrix",
]

VALID_TARGETS = ("venv", "dev")


def target() -> str:
    value = os.environ.get("SD_VERIFY_TARGET", "").strip().lower() or None
    if value is None:
        for arg in sys.argv[1:]:
            if arg.startswith("--target="):
                value = arg.split("=", 1)[1].strip().lower()
            elif arg == "--target" and sys.argv.index(arg) + 1 < len(sys.argv):
                value = sys.argv[sys.argv.index(arg) + 1].strip().lower()
        value = value or "venv"
    if value not in VALID_TARGETS:
        print(f"VERIFY_FAIL: invalid target {value!r} (valid: {VALID_TARGETS})", file=sys.stderr)
        sys.exit(2)
    return value


def main() -> int:
    run_target = target()
    print(f"[verify] target={run_target} probes={len(PROBE_ORDER)}")

    unknown = sorted(
        p.stem for p in HERE.glob("verify_*.py")
        if p.stem not in PROBE_ORDER and p.stem != "verify_lib"
    )
    if unknown:
        print(f"VERIFY_FAIL: probe files not in PROBE_ORDER (frozen-plan drift): {unknown}", file=sys.stderr)
        return 1

    failure_mode = os.environ.get("SD_VERIFY_FAILURE_MODE", "hard").strip().lower()
    results: list[tuple[str, str, str]] = []  # (name, status, detail)

    for name in PROBE_ORDER:
        try:
            mod = importlib.import_module(name)
            outcome = mod.run()
            status = "PASS" if outcome in (None, "PASS") else str(outcome)
        except Exception as exc:  # noqa: BLE001 — a probe failure IS the signal
            status = "FAIL"
            detail = f"{type(exc).__name__}: {exc}"
            results.append((name, status, detail))
            print(f"[verify] {name}: FAIL — {detail}")
            if os.environ.get("SD_VERIFY_VERBOSE") == "1":
                traceback.print_exc()
            continue
        detail = ""
        results.append((name, status, detail))
        line = f"[verify] {name}: {status}"
        if outcome not in (None, "PASS"):
            line += f" — {outcome}"
        print(line)

    failed = [r for r in results if r[1] == "FAIL"]
    print("\n[verify] === summary ===")
    for name, status, _ in results:
        print(f"  {status:6}  {name}")

    if failed and failure_mode == "hard":
        print(f"VERIFY_FAIL: {len(failed)}/{len(results)} probes failed (hard mode)")
        return 1
    if failed:
        print(f"VERIFY_OK: {len(failed)}/{len(results)} probes failed but failure mode is soft")
        return 0
    print(f"VERIFY_OK: all {len(results)} probes passed (target={run_target})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
