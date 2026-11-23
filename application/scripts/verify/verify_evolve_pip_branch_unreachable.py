"""Probe A2: evolve pip branch must be UNREACHABLE in the payload.

Path inventory A2: provision.py:86 builds a `-m pip install` command
when `find_spec("pip")` is not None. G0 (2026-11-23, see D3 §G0 拍板
记录) removed the runtime pip fallback from packaged mode: in the
assembled venv payload pip is deliberately NOT swept in... in fact it
IS present in a uv venv by default. The invariant this probe asserts
post-D3: in the FROZEN onedir, `pip` must not resolve (no pip module
in the PYZ), which makes the branch structurally dead.

Today (venv payload baseline) the honest assertion is the branch's
own guard: find_spec("pip") may be None (branch dead) or the probe
runs in dev/payload venv where pip exists — that is NOT a failure of
the current shape, it is the pre-D3 baseline. So:

  * target=frozen (after D3): find_spec("pip") must be None — hard.
  * target=venv/dev (baseline): record which state we are in; the
    probe passes either way but PRINTS the baseline fact, because the
    probe's job right now is to make the pip-branch state visible and
    eventually flippable to hard when P1/P2 land.

Run with SD_VERIFY_TARGET=venv today; the runner flips the assertion
to hard when the collection is pointed at a frozen payload.
"""

from __future__ import annotations

import importlib.util


def run() -> str | None:
    has_pip = importlib.util.find_spec("pip") is not None
    target = __import__("verify_lib").target()

    if target == "frozen":
        assert not has_pip, (
            "G0 violation: pip resolves inside the frozen payload — the "
            "provision.py pip branch is live. Re-check spec excludes."
        )
        return "PASS: pip unresolvable in frozen payload (G0 holds)"

    state = "pip PRESENT (venv baseline — branch live, expected pre-D3)" if has_pip \
        else "pip ABSENT (branch already dead)"
    print(f"[verify] pip branch state: {state}")
    return None
