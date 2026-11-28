"""Probe A3: evolve vendored runner must resolve to a real FILE.

Path inventory A3: measurement.py default_runner_argv() imports
`.vendor.puct.runner` and uses `Path(runner.__file__).resolve()` as the
argv[0] of a subprocess running with `-I` (isolated mode strips the
package path, so the file must be reachable on disk by absolute path).
This is the one evolve path that needs a REAL FILE, not just an
importable module: after D3, `runner.__file__` inside the frozen app
points into the PYZ archive — which is NOT a disk path a subprocess can
execute. The vendored runner must therefore land in the onedir as a
loose file (TOC datas/binary entry) and the spawn contract must pass
that on-disk path.

Baseline (venv): asserts runner.__file__ exists on disk (trivially true
in a venv, still worth asserting — a broken editable install would fail
here, exactly the stale-.pth field incident class).
Post-D3: additionally asserts the resolved path is NOT inside an
archive (no sys.frozen-style virtual path) — that assertion activates
when SD_VERIFY_TARGET=frozen.
"""

from __future__ import annotations

from pathlib import Path


def run() -> str | None:
    from sciencediscovery_evolve.vendor.puct import runner

    file = getattr(runner, "__file__", None)
    assert file, "vendored puct runner has no __file__ (hollow module?)"
    resolved = Path(file).resolve()
    assert resolved.is_file(), f"runner.__file__ is not a real file on disk: {resolved}"

    target = __import__("verify_lib").target()
    if target == "frozen":
        # In a frozen app a module whose __file__ lives inside an archive
        # resolves to something like ".../base_library.zip/puct/runner.py"
        # or a PYZ-internal path; -I subprocess exec of that fails. The
        # spawn contract (D3 P1-3) must pass an on-disk path instead.
        archive_markers = (".zip/", ".pyz", "base_library")
        hits = [m for m in archive_markers if m in str(resolved).lower()]
        assert not hits, (
            f"vendored runner resolves into an archive ({hits}) — the -I "
            "subprocess spawn cannot execute it. It must be staged as a "
            "loose on-disk file in the onedir (TOC datas entry)."
        )
        return f"PASS: runner is a loose on-disk file at {resolved}"

    return None
