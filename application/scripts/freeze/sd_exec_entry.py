# Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
# http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""SD freeze exec-entry dispatcher (D3 P1-3).

One frozen exe per python tree (sd-jw.exe / sd-services.exe); argv[0]
after the entry name selects the real entry, argv[1:] forwards as-is.
The Node spawn contract swaps `python -m <module>` for
`<exe> <entry>` with ZERO other changes — same argv, same env, same
exit codes (a subprocess that dies before main still exits non-zero,
whatever the bootloader prints).

Entry table (frozen tree -> module:main):
  jw        jiuwenswarm.server.bootstrap:main       (agent executor)
  evolve    sciencediscovery_evolve.app:main        (evolve sidecar)
  paper     paper_worker main                        (file entry, exec'd)
  candidate sciencediscovery_evolve.candidate:main  (-I sandbox semantics)
  mcp:<n>   sciencediscovery_gateway.<n>_mcp:main   (stdio MCP servers)
  gateway   sciencediscovery_gateway.app:main

Design notes:
- The dispatcher itself imports NOTHING beyond stdlib at module top;
  every entry module imports lazily inside main() so a bad entry cannot
  break the others (and cold-start stays patch-0010-shaped).
- `paper` is a FILE entry in the venv world (services/paper/
  paper_worker.py, run by absolute path). Frozen: the file is staged
  as a loose on-disk script (TOC datas) precisely because the -I-style
  subprocess contract needs a real path; runpy.run_path keeps that
  shape. See verify_evolve_vendored_runner_path.py for the same rule
  applied to the vendored puct runner.
- Exit-code discipline: die() prints to stderr and exits 2 (usage) /
  3 (unknown entry) / 1 (entry crash re-raise). Node treats non-zero
  uniformly — no caller distinguishes 1 vs 2 today, and none may.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

_ENTRIES = {
    "jw": ("jiuwenswarm.server.bootstrap", "main"),
    "evolve": ("sciencediscovery_evolve.app", "main"),
    "candidate": ("sciencediscovery_evolve.candidate", "main"),
    "gateway": ("sciencediscovery_gateway.app", "main"),
}


def _die(code: int, message: str) -> None:
    print(f"sd-entry: {message}", file=sys.stderr)
    raise SystemExit(code)


def main() -> None:
    if len(sys.argv) < 2:
        _die(2, f"usage: {sys.argv[0]} <entry> [args...]; entries: {sorted(_ENTRIES) + ['paper', 'mcp:<name>']}")

    entry, rest = sys.argv[1], sys.argv[2:]

    if entry == "paper":
        # Loose-file entry (see module docstring): the worker script is
        # staged on disk next to the exe, not in the archive.
        candidates = [
            Path(sys.executable).resolve().parent / "paper_worker.py",
            Path(sys.executable).resolve().parent / "paper" / "paper_worker.py",
        ]
        script = next((c for c in candidates if c.is_file()), None)
        if script is None:
            _die(3, f"paper entry: no paper_worker.py on disk near {sys.executable}")
        sys.argv = [str(script), *rest]
        runpy.run_path(str(script), run_name="__main__")
        return

    if entry.startswith("mcp:"):
        name = entry.split(":", 1)[1]
        module = f"sciencediscovery_gateway.{name}"
        try:
            mod = __import__(module, fromlist=["main"])
        except ImportError as exc:
            _die(3, f"unknown MCP server {name!r}: {exc}")
        mod.main(*rest)
        return

    if entry not in _ENTRIES:
        _die(3, f"unknown entry {entry!r}; known: {sorted(_ENTRIES) + ['paper', 'mcp:<name>']}")

    module_name, attr = _ENTRIES[entry]
    mod = __import__(module_name, fromlist=[attr])
    main_fn = getattr(mod, attr, None)
    if not callable(main_fn):
        _die(3, f"entry {entry!r}: {module_name}.{attr} is not callable")
    main_fn(*rest)


if __name__ == "__main__":
    main()
