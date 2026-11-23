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

"""PyInstaller runtime_hook: the frozen-app replacement for the two venv-era
interpreter shims, applied before ANY app code runs.

Source of truth for WHAT this replaces — do not diverge from those files:

1. services/adapter/src/sciencediscovery_adapter/sitecustomize.py
   (the MCP call-timeout patch chain). venv mechanism: PYTHONPATH puts
   sitecustomize on jw interpreters; a MetaPathFinder wraps the loader of
   jiuwenswarm.server.runtime.agent_adapter.interface_deep so the patch
   applies right after that module loads, before startup prewarming
   creates any MCP client. Frozen mechanism: a runtime_hook runs BEFORE
   app code, so the finder goes in here unconditionally (the activation
   env var SCIENCE_AGENT_JIUWENSWARM_BOOTSTRAP is a venv concept; the
   frozen jw entry is ONLY the jw app, same semantics, no gate needed).

2. The sitecustomize Popen patch (CREATE_NO_WINDOW) — Windows-only, so
   no-op on macOS exactly like today (the venv sitecustomize gates it
   behind platform checks; frozen keeps the same contract).

3. scripts/desktop-venv-sitecustomize.py — the venv-launchers.mjs copy
   of the same two concerns for the desktop's sd-services venv. The
   frozen sd-services entry does not import jw, so part 1 is jw-entry
   only; part 2 applies to every Windows entry.

What a runtime_hook may NOT do (PyInstaller contract): import app
packages eagerly. This hook only installs meta-path machinery and sets
process flags; the patch modules are imported lazily inside the wrapped
loader — same trick the venv version uses to keep cold-start imports
off the bootloader path (patch 0010's cold-start contract).
"""

from __future__ import annotations

import importlib.abc
import importlib.machinery
import sys
from types import ModuleType
from typing import Any

_TARGET = "jiuwenswarm.server.runtime.agent_adapter.interface_deep"


class _PatchAfterImportLoader(importlib.abc.Loader):
    def __init__(self, wrapped: importlib.abc.Loader) -> None:
        self._wrapped = wrapped

    def create_module(self, spec: Any) -> ModuleType | None:
        create = getattr(self._wrapped, "create_module", None)
        return create(spec) if create else None

    def exec_module(self, module: ModuleType) -> None:
        self._wrapped.exec_module(module)
        # Imported HERE (not at hook top): a runtime_hook that imported
        # jw eagerly would drag the whole cold-start chain into the
        # bootloader — the exact cost patch 0010 removed.
        from jiuwenswarm.server.runtime.mcp.call_timeout_patch import apply_mcp_call_timeout_patch

        apply_mcp_call_timeout_patch()


class _PatchBeforePrewarmFinder(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname: str, path: Any, target: ModuleType | None = None):
        if fullname != _TARGET:
            return None
        # FrozenImporter (and the PYZ archive) sit AHEAD of this finder,
        # so resolving the real loader does not recurse. Remove the
        # one-shot hook once claimed, exactly like the venv version.
        try:
            sys.meta_path.remove(self)
        except ValueError:
            pass
        spec = importlib.machinery.PathFinder.find_spec(fullname, path, target)
        if spec is None:
            # In the frozen app the module comes from FrozenImporter, not
            # the filesystem; ask the meta_path for the claim instead.
            for finder in sys.meta_path:
                if isinstance(finder, _PatchBeforePrewarmFinder):
                    continue
                spec = finder.find_spec(fullname, path, target) if hasattr(finder, "find_spec") else None
                if spec is not None and getattr(spec, "loader", None) is not None:
                    spec.loader = _PatchAfterImportLoader(spec.loader)
                    return spec
            return None
        if spec.loader is not None:
            spec.loader = _PatchAfterImportLoader(spec.loader)
        return spec


sys.meta_path.insert(0, _PatchBeforePrewarmFinder())

# --- Windows process-creation flag (CREATE_NO_WINDOW), same contract as the
# venv sitecustomize: every child process spawned by the Python side of the
# desktop app must not flash a console window. macOS is a no-op by design.
if sys.platform == "win32":
    import subprocess

    _CREATE_NO_WINDOW = 0x08000000

    class _QuietPopen(subprocess.Popen):
        """Popen that always passes CREATE_NO_WINDOW unless the caller did."""

        def __init__(self, *args, **kwargs):
            creationflags = kwargs.get("creationflags", 0) | _CREATE_NO_WINDOW
            kwargs["creationflags"] = creationflags
            super().__init__(*args, **kwargs)

    subprocess.Popen = _QuietPopen
