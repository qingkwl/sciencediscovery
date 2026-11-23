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
`<exe> <entry>` with ZERO other changes -- same argv, same env, same
exit codes (a subprocess that dies before main still exits non-zero,
whatever the bootloader prints).

WHICH TREE the exe dispatches for is fixed at BUILD time by the spec
(SD_TREE define): 'jw' entries come from the jw tree's real
[project.scripts] table (workswarm0.2.6), 'services' entries from the
five sd sidecars. Two specs, two exes, one dispatcher source.

Entry table -- jw tree (verified against pyproject [project.scripts]):
  start/stop/agentserver/gateway/cli/web/desktop/init/acp/jiuwenbox

Entry table -- services tree:
  evolve    sciencediscovery_evolve.app:main          (evolve sidecar)
  paper     paper_worker main                           (file entry, runpy)
  candidate sciencediscovery_evolve.candidate:main     (-I sandbox semantics)
  mcp:<n>   sciencediscovery_gateway.<n>_mcp:main      (stdio MCP servers)
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
  uniformly -- no caller distinguishes 1 vs 2 today, and none may.
"""

from __future__ import annotations

import runpy
import sys
from pathlib import Path

# Which tree this exe dispatches for: fixed by the spec via the
# SD_EXEC_TREE runtime-hook env or the exe name at build time. The
# jw spec sets it to "jw"; the (upcoming) services spec sets "services".
import os as _os
_SD_TREE = _os.environ.get("SD_EXEC_TREE", "jw")

_JW_ENTRIES = {
    # The REAL console scripts from the jw tree's [project.scripts] --
    # verified against the provisioned workswarm0.2.6 pyproject. SD's
    # spawn contract calls these exact entry points (start/agentserver/
    # gateway/acp...); jiuwenswarm.mjs maps venv entry names to these.
    "start": ("jiuwenswarm.start_services", "main"),
    "stop": ("jiuwenswarm.debug_launcher", "main"),
    "agentserver": ("jiuwenswarm.server.app_agentserver", "main"),
    "gateway": ("jiuwenswarm.gateway.app_gateway", "main"),
    "cli": ("jiuwenswarm.cli.main", "main"),
    "web": ("jiuwenswarm.channels.web.app_web", "main"),
    "desktop": ("jiuwenswarm.channels.desktop.desktop_app", "main"),
    "init": ("jiuwenswarm.init_workspace", "main"),
    "acp": ("jiuwenswarm.gateway.channel_manager.protocol.acp.acp_connect", "main"),
    "jiuwenbox": ("jiuwenbox.cli.jiuwenbox", "main"),
}

_SERVICES_ENTRIES = {
    "evolve": ("sciencediscovery_evolve.app", "main"),
    "candidate": ("sciencediscovery_evolve.candidate", "main"),
    "gateway": ("sciencediscovery_gateway.app", "main"),
}

_ENTRIES = _JW_ENTRIES if _SD_TREE == "jw" else _SERVICES_ENTRIES

# Static import surface: PyInstaller's Analysis follows THESE (module-
# level, one per entry), not the string lookups in main(). Upstream's
# exe entry gets the same coverage from function-body imports; a
# dispatcher that only built module names at runtime would freeze an
# exe where every entry dies with ModuleNotFoundError (the first
# build did exactly that -- lesson: dynamic dispatch NEEDS a static
# import surface for the freezer). The aliasing also fails fast here,
# at build time, if an entry module moves upstream.
if _SD_TREE == "jw":
    # Static import surface: PyInstaller's Analysis follows THESE (module-
    # level, one per entry), not the string lookups in main(). Upstream's
    # exe entry gets the same coverage from function-body imports; a
    # dispatcher that only built module names at runtime would freeze an
    # exe where every entry dies with ModuleNotFoundError (the first
    # build did exactly that -- lesson: dynamic dispatch NEEDS a static
    # import surface for the freezer).
    # web/desktop/jiuwenbox are NOT imported: SD's Electron shell is the
    # UI, and webview is an [SD-D3 4] exclude -- importing desktop_app
    # here would pull webview back in and fail at freeze time.
    from jiuwenswarm.start_services import main as _e_start
    from jiuwenswarm.debug_launcher import main as _e_stop
    from jiuwenswarm.server.app_agentserver import main as _e_agentserver
    from jiuwenswarm.gateway.app_gateway import main as _e_gateway
    from jiuwenswarm.cli.main import main as _e_cli
    from jiuwenswarm.init_workspace import main as _e_init
    from jiuwenswarm.gateway.channel_manager.protocol.acp.acp_connect import main as _e_acp
    _STATIC = {
        "start": _e_start, "stop": _e_stop, "agentserver": _e_agentserver,
        "gateway": _e_gateway, "cli": _e_cli, "init": _e_init, "acp": _e_acp,
    }
    # Entries in _JW_ENTRIES but NOT in _STATIC (web/desktop/jiuwenbox)
    # stay dispatchable through the runtime table when run unfrozen.
else:
    _STATIC = {}  # services spec lands in P2; entries added there


def _die(code: int, message: str) -> None:
    print(f"sd-entry: {message}", file=sys.stderr)
    raise SystemExit(code)


def main() -> None:
    args = sys.argv[1:]

    # `-m <module>` passthrough: jw's start_services spawns its children
    # as `<python> -m jiuwenswarm.app ...` (venv-era contract). In the
    # frozen world sys.executable IS this exe, so the dispatcher must
    # honor -m exactly like python does -- including its exit-code
    # discipline (runpy: a nonzero sys.exit propagates; an uncaught
    # exception exits 1). This is the ONE compatibility shim that makes
    # jw-internal spawns work without patching start_services.
    # Desktop child-invocation flags: jw's app.py spawns its agent/
    # gateway children as `<exe> --desktop-run-agent` / `--desktop-run-
    # gateway` when sys.frozen (upstream's OWN frozen contract, kept
    # verbatim so app.py needs no patch). Forward each flag straight to
    # the corresponding -m target.
    _DESKTOP_FLAG_TO_MODULE = {
        "--desktop-run-agent": "jiuwenswarm.server.app_agentserver",
        "--desktop-run-gateway": "jiuwenswarm.gateway.app_gateway",
    }
    if args and args[0] in _DESKTOP_FLAG_TO_MODULE:
        module = _DESKTOP_FLAG_TO_MODULE[args[0]]
        sys.argv = [args[0], *args[1:]]
        runpy.run_module(module, run_name="__main__", alter_sys=True)
        return

    if args and args[0] == "-m":
        if len(args) < 2:
            _die(2, "usage: -m requires a module name")
        module = args[1].replace("-", "_")
        # console-script style: `python -m jiuwenswarm.app` runs the
        # module's __main__ guard equivalent -- use runpy.run_module.
        sys.argv = [args[1], *args[2:]]
        runpy.run_module(module, run_name="__main__", alter_sys=True)
        return

    if not args:
        _die(2, f"usage: {sys.argv[0]} <entry> [args...]; entries: {sorted(_ENTRIES) + ['paper', 'mcp:<name>']}")

    entry, rest = args[0], args[1:]

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

    main_fn = _STATIC.get(entry)
    if main_fn is None:
        # Fallback to the table (covers dev-run of this file outside a
        # frozen build, where the static block may not have run).
        module_name, attr = _ENTRIES[entry]
        mod = __import__(module_name, fromlist=[attr])
        main_fn = getattr(mod, attr, None)
        if not callable(main_fn):
            _die(3, f"entry {entry!r}: {module_name}.{attr} is not callable")
    # console_scripts semantics: main() reads sys.argv[0:] itself.
    # Rewrite argv so sys.argv[1] is the first entry ARG, not the entry
    # NAME (passing *rest would break zero-arg mains -- the -c smoke
    # test caught exactly that).
    sys.argv = [sys.argv[0], *rest]
    main_fn()


if __name__ == "__main__":
    main()
