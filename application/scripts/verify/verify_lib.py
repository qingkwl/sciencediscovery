"""Shared helpers for verify_* probes.

Kept import-light on purpose: every import here happens inside whatever
environment the probe collection runs in (venv payload today, frozen
onedir after D3), so this module must not pull optional packages at
module scope. Probes import from it inside run(), not at file top.
"""

from __future__ import annotations

import os
import sys


def target() -> str:
    """The collection's target env: 'venv' (assembled payload), 'dev',
    or 'frozen' (post-D3 onedir — activates the extra assertions in
    pip-branch / vendored-runner / sitecustomize probes).

    Payload-only probes downgrade themselves on a dev tree with a loud
    SKIP-PAYLOAD-ONLY marker (returned so run_verify prints it).
    """
    from run_verify import VALID_TARGETS  # noqa: PLC0415 — same dir import

    value = os.environ.get("SD_VERIFY_TARGET", "").strip().lower()
    if not value:
        for arg in sys.argv[1:]:
            if arg.startswith("--target="):
                value = arg.split("=", 1)[1].strip().lower()
                break
    return value if value in VALID_TARGETS else "venv"


def payload_only(probe_name: str, what: str) -> str | None:
    """Return the SKIP marker on a dev tree, else None (run the probe).

    A skip is ONLY legal for invariants that hold exclusively in the
    payload (e.g. pip must not be importable). Anything else failing on
    a dev tree is a real failure and must not be routed through here.
    """
    if target() == "dev":
        return f"SKIP-PAYLOAD-ONLY: {probe_name} ({what}) is a payload invariant; dev tree keeps it"
    return None


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)
