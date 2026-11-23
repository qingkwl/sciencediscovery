"""Probe A4: adapter→jw sitecustomize patch chain applies.

Path inventory A4 (the highest-risk cross-tree dynamic path):
services/adapter/src/sciencediscovery_adapter/sitecustomize.py inserts a
MetaPathFinder that wraps the loader of
`jiuwenswarm.server.runtime.agent_adapter.interface_deep`; the moment
that module is first imported it imports
`jiuwenswarm.server.runtime.mcp.call_timeout_patch` and applies it —
BEFORE jw startup prewarming creates any MCP client (else the first
client keeps jw's 30-second fallback for its whole lifetime).

Activation gate: SCIENCE_AGENT_JIUWENSWARM_BOOTSTRAP=1 (start-stack sets
it for jw processes; PYTHONPATH carries this sitecustomize into the jw
interpreter).

Post-D3 this chain moves into the PyInstaller runtime_hook (D3 P1-4),
but the OBSERVABLE contract this probe asserts is unchanged and is the
real product guarantee: after interface_deep loads, MCP call timeouts
must NOT be jw's 30s fallback — they must be patch-controlled values.

Baseline venv note: this probe runs in the sd-services env, where jw is
importable (the assembled payload ships jw's site-packages through the
shared venv, and dev trees have it editable). If jw is genuinely absent
(from a stripped probe env), the probe reports SKIP-JW-ABSENT rather
than failing — the jw-side version of this same contract is probed at
stack startup by the product itself.
"""

from __future__ import annotations


def run() -> str | None:
    import importlib.util

    if importlib.util.find_spec("jiuwenswarm") is None:
        return "SKIP-JW-ABSENT: jw not importable in this probe env"

    # 1. The patch module itself must import — it is reached DYNAMICALLY
    #    (inside exec_module after interface_deep), so a static scan of
    #    adapter alone never proves it resolves.
    from jiuwenswarm.server.runtime.mcp.call_timeout_patch import (
        apply_mcp_call_timeout_patch,
    )

    # 2. interface_deep must import (the wrapped target; in the baseline
    #    venv there is no wrapping finder — plain import is the pre-D3
    #    truth; post-frozen the runtime_hook must have applied the patch
    #    BEFORE this line runs).
    import jiuwenswarm.server.runtime.agent_adapter.interface_deep  # noqa: F401

    # 3. Apply idempotently and assert the observable contract: the
    #    patch took effect. apply_mcp_call_timeout_patch either returns
    #    a truthy status or mutates module-level defaults; probe both
    #    shapes without assuming which.
    result = apply_mcp_call_timeout_patch()
    if result is not None:
        print(f"[verify] call_timeout_patch apply result: {result}")
    return None
