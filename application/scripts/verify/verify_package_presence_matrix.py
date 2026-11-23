"""Probe A9 (inventory 'presence matrix'): swept-package table assertion.

Mirrors probe-payload-runtime.py assertion 5, generalized: the package
presence matrix is asserted, not merely printed. NEVER_PRESENT is what
the payload-slim sweep rules delete; ALWAYS_PRESENT is what the same
rules must never touch. A rule that silently stops matching ships its
dead weight back (the F12 lesson), and a rule that over-matches breaks
the babel chain (the W6 lesson) — this probe catches BOTH directions
independently of the functional probes.

Dev trees legitimately keep the swept packages: SD_PROBE_DEV_TREE=1
(same env var, same exact-"1" semantics as the A1b probe) drops the
ABSENT half and keeps the PRESENT half. The value is compared to
exactly "1" on purpose: a mistyped "true"/"yes" keeps BOTH halves
enforced, failing loudly on a dev tree instead of silently weakening a
payload build.
"""

from __future__ import annotations

import importlib.util
import os

NEVER_PRESENT = ("onnxruntime", "kubernetes")
ALWAYS_PRESENT = (
    "babel",
    "courlan",
    "trafilatura",
    "chromadb",
    "openjiuwen",
    # A-area additions (first-party services the payload must carry):
    "sciencediscovery_gateway",
    "sciencediscovery_evolve",
    "sciencediscovery_adapter",
    "pdfplumber",
)


def run() -> None:
    dev_tree = os.environ.get("SD_PROBE_DEV_TREE") == "1"

    if not dev_tree:
        for name in NEVER_PRESENT:
            spec = importlib.util.find_spec(name)
            assert spec is None, (
                f"package {name!r} is present but the sweep rules should have "
                f"removed it (rule stopped matching? dead weight shipped)"
            )

    for name in ALWAYS_PRESENT:
        spec = importlib.util.find_spec(name)
        assert spec is not None, (
            f"package {name!r} is ABSENT but the payload must carry it "
            f"(over-matching sweep rule? W6 babel class regression)"
        )
