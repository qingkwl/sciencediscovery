# -*- mode: python ; coding: utf-8 -*-
# Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
r"""SD freeze spec for the jw tree (D3 P1-1).

THIN DELTA over the upstream baseline spec (frozen copy:
jw-upstream.spec.baseline, tag workswarm0.2.6 @ ad0c9dfb). Keep this file
a small, reviewable diff -- every divergence from upstream is tagged
[SD-D3] with its reason. When the jw tag bumps, re-diff this file
against the new upstream spec (the P1-2 delta procedure).

Divergences (complete list):
  1. project_root points at the provisioned jw checkout under
     .sciencediscovery-data (spec lives in SD's repo, builds SD's tree).
  2. Entry script: SD's freeze/sd_exec_entry.py (exec-entry dispatcher)
     instead of upstream's jiuwenswarm_exe_entry.py -- same dispatch
     idea, SD's spawn contract table (freeze/README.md).
  3. runtime_hooks: freeze/sd_runtime_hook.py (the adapter
     sitecustomize chain + CREATE_NO_WINDOW, P1-4).
  4. excludes += patch 0018's subtraction set (playwright, uv) -- the
     SD payload never ships those deps even before the sweep existed.
  5. The build_config sync gate and frontend-dist gate run against the
     provisioned tree, not a developer checkout.
  6. Second Analysis (MCP entry) is DROPPED in the SD delta: SD spawns
     MCP servers from its own services tree (sciencediscovery_gateway),
     not from jw's team-MCP entry. Dropping it halves the build time;
     upstream keeps it for their standalone product.

Everything below is copied from the upstream baseline with the six
divergences applied; sections are kept in upstream order for diffing.
"""

import glob
import os
import runpy
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules, copy_metadata

block_cipher = None

SPEC_DIR = os.path.abspath(globals().get("SPECPATH", os.getcwd()))
# [SD-D3 1] SD repo root = three levels up from application/scripts/freeze;
# the jw tree is the provisioned checkout under .sciencediscovery-data.
sd_repo_root = os.path.abspath(os.path.join(SPEC_DIR, "..", "..", ".."))
project_root = os.path.abspath(
    os.path.join(sd_repo_root, ".sciencediscovery-data", "jiuwenswarm", "src")
)
# [SD-D3 P1-5] assemble staged mode: assemble 5.5 stages the whole jw
# tree (venv included) into the payload and builds from THAT copy —
# SD_FREEZE_VENV carries the staged venv's Scripts/bin dir; the staged
# tree root is two levels up from it. Everything below (build_config
# gate, collect faces, pathex) then resolves against the staged tree,
# which is a byte-identical copy of the source tree (same contract,
# different physical location).
_staged_venv = os.environ.get("SD_FREEZE_VENV")
if _staged_venv:
    project_root = os.path.abspath(os.path.join(_staged_venv, "..", ".."))

# [SD-D3 5] upstream build_config gate, pointed at the provisioned tree.
build_config_module = runpy.run_path(os.path.join(project_root, "scripts", "build_config.py"))
build_config = build_config_module["load_build_config"](Path(project_root))
runtime_config_path = Path(project_root, "jiuwenswarm", "common", "_build_config.py")
expected_runtime_config = build_config_module["render_runtime_python"](build_config)
if not runtime_config_path.is_file() or runtime_config_path.read_text(encoding="utf-8") != expected_runtime_config:
    raise SystemExit(
        "SD-D3: jw build_config out of sync in the provisioned tree; re-run scripts/jiuwenswarm.sh setup"
    )
symphony_root = os.path.join(project_root, "jiuwenswarm", "symphony")
if symphony_root not in sys.path:
    sys.path.insert(0, symphony_root)

# [SD-D3 1] The venv to collect from is the jw venv of the provisioned
# tree. Upstream specs run inside their dev venv; SD runs pyinstaller
# FROM that venv's python so collect_* resolve against it.
# assemble 5.5 overrides this with SD_FREEZE_VENV: it stages the jw tree
# (venv included) into the payload and builds from the STAGED venv, which
# is a byte-identical copy — same contract, different physical tree.
_jw_venv_scripts = os.environ.get("SD_FREEZE_VENV") or os.path.join(
    project_root, ".venv", "Scripts" if sys.platform == "win32" else "bin"
)
if os.path.abspath(os.path.dirname(sys.executable)) != os.path.abspath(_jw_venv_scripts):
    raise SystemExit(
        f"SD-D3: run this spec with the jw venv python ({_jw_venv_scripts}), not {sys.executable}"
    )

DATA_FILE_PATTERNS = ["**/*.yaml", "**/*.yml", "**/*.json", "**/*.md"]
EXTENSION_DATA_FILE_PATTERNS = ["**/*.py", *DATA_FILE_PATTERNS]
DISPATCH_PACKAGE_ROOTS = ("indexing", "models", "orchestration", "retrieval", "shared")
EXCLUDED_RESOURCE_DIRS = (
    os.path.join("agent", "workspace", "skills", "project-maintainer"),
)
OPENJIUWEN_DATA_EXCLUDES = [
    "**/AGENTS.md",
    "**/CLAUDE.md",
    "**/deepagents/tools/browser_move/.browser/**",
    "**/deepagents/tools/browser_move/.browser-profiles/**",
    "**/deepagents/tools/browser_move/.venv/**",
    "**/deepagents/tools/browser_move/logs/**",
    "**/deepagents/tools/browser_move/.env",
]


def collect_tree_data_files(source_dir, target_dir, patterns):
    data_files = []
    for pattern in patterns:
        full_pattern = os.path.join(source_dir, pattern)
        for path in glob.glob(full_pattern, recursive=True):
            if not os.path.isfile(path):
                continue
            rel_dir = os.path.dirname(os.path.relpath(path, source_dir))
            dest_dir = os.path.normpath(os.path.join(target_dir, rel_dir))
            data_files.append((path, dest_dir))
    return data_files


def collect_resources_data_files(source_dir, target_dir):
    data_files = []
    excluded_dirs = {
        os.path.normcase(os.path.abspath(os.path.join(source_dir, rel_path)))
        for rel_path in EXCLUDED_RESOURCE_DIRS
    }
    for root, dirs, files in os.walk(source_dir):
        root_abs = os.path.normcase(os.path.abspath(root))
        dirs[:] = [
            dirname for dirname in dirs
            if os.path.normcase(os.path.abspath(os.path.join(root, dirname))) not in excluded_dirs
        ]
        if any(root_abs == excluded or root_abs.startswith(excluded + os.sep) for excluded in excluded_dirs):
            continue
        rel_dir = os.path.relpath(root, source_dir)
        if rel_dir == ".":
            rel_dir = ""
        dest_dir = os.path.normpath(os.path.join(target_dir, rel_dir))
        for filename in files:
            data_files.append((os.path.join(root, filename), dest_dir))
    return data_files


def collect_tree_python_modules(source_dir, package_roots):
    modules = []
    for package_root in package_roots:
        package_dir = os.path.join(source_dir, *package_root.split("."))
        for path in glob.glob(os.path.join(package_dir, "**", "*.py"), recursive=True):
            rel_path = os.path.relpath(path, source_dir)
            module_name = os.path.splitext(rel_path)[0].replace(os.sep, ".")
            if module_name.endswith(".__init__"):
                module_name = module_name[: -len(".__init__")]
            modules.append(module_name)
    return sorted(set(modules))


# [SD-D3 4] Upstream collects webview unconditionally and hard-fails
# without pywebview. The SD payload never opens a jw webview window
# (SD's Electron shell IS the UI), so pywebview is excluded instead --
# same shape as upstream's own excludes, applied one package earlier.
webview_datas = []
webview_hiddenimports = []

# [SD-D3 5] Frontend dist gate: the provisioned tree does not build the
# jw web frontend (SD serves its own), so the dist requirement does not
# apply. jw's web channel static assets are simply absent.
web_datas = []

datas = webview_datas + web_datas

_playwright_mcp_resource_dir = os.path.join(
    project_root, "jiuwenswarm", "resources", "runtime", "playwright-mcp",
)
# [SD-D3 4] patch 0018 removes the playwright dependency from SD's jw
# tree; the bundled playwright-mcp runtime zip is absent by design.
# Keep the path checks OFF -- absence is the expected state.

_resource_datas = collect_resources_data_files(
    os.path.join(project_root, "jiuwenswarm", "resources"),
    "jiuwenswarm/resources",
)
datas += _resource_datas
datas += [
    (
        os.path.join(project_root, "OPEN_SOURCE_SOFTWARE_NOTICE.md"),
        ".",
    )
]
datas += collect_data_files(
    "certifi",
    include_py_files=False,
    includes=["cacert.pem"],
)
datas += copy_metadata("fastmcp", recursive=True)
datas += copy_metadata("mcp", recursive=True)
datas += copy_metadata("openjiuwen", recursive=True)
datas += collect_data_files("openjiuwen", include_py_files=False, excludes=OPENJIUWEN_DATA_EXCLUDES)
datas += collect_data_files(
    "a2ui",
    include_py_files=False,
    includes=["assets/0.8/*.json"],
)
datas += collect_data_files(
    "jiuwenswarm.extensions",
    include_py_files=True,
    includes=EXTENSION_DATA_FILE_PATTERNS,
)
datas += collect_data_files(
    "jiuwenswarm.symphony",
    include_py_files=False,
    includes=DATA_FILE_PATTERNS,
)
datas += collect_data_files(
    "jiuwenswarm.agents.harness.code.rails.sdd.design_rail",
    include_py_files=False,
    includes=["**/*.yaml", "**/*.yml", "**/*.json", "**/*.md", "**/*.mjs"],
)
for package_root in DISPATCH_PACKAGE_ROOTS:
    datas += collect_tree_data_files(
        os.path.join(symphony_root, package_root),
        package_root,
        DATA_FILE_PATTERNS,
    )

openjiuwen_submodules = collect_submodules("openjiuwen")
symphony_submodules = collect_submodules("jiuwenswarm.symphony")
team_kv_cache_hiddenimports = ["jiuwenswarm.agents.harness.team.kv_cache_hooks"]
dispatch_submodules = collect_tree_python_modules(symphony_root, DISPATCH_PACKAGE_ROOTS)
http2_submodules = [
    *collect_submodules("h2"),
    *collect_submodules("hpack"),
    *collect_submodules("hyperframe"),
]
# [SD-D3 5, W14 — the lazy-__init__ import surfaces] Four packages expose
# their contents through module __getattr__ + importlib.import_module
# (PEP 562 lazy exports): gateway, gateway.cron, gateway.channel_manager,
# agents.harness.common.tools. PyInstaller's static analysis cannot follow
# a name that is only resolved at attribute-lookup time — the rc3 field
# run died at gateway startup with ModuleNotFoundError: No module named
# 'jiuwenswarm.gateway.cron.controller' (the cron package scored zero
# archive entries while its __init__ sat green in the PYZ). Sweep each
# lazy package's FULL submodule tree so every lazy target and everything
# those targets import statically rides along; a zero-module sweep for a
# package that exists on disk is breakage, not an answer (W13's lesson).
lazy_packages = [
    "jiuwenswarm.gateway",
    "jiuwenswarm.gateway.cron",
    "jiuwenswarm.gateway.channel_manager",
    "jiuwenswarm.agents.harness.common.tools",
]
lazy_submodules = []
for _lazy_pkg in lazy_packages:
    _mods = collect_submodules(_lazy_pkg)
    if not _mods:
        raise SystemExit(
            f"SD-D3: collect_submodules({_lazy_pkg!r}) returned ZERO modules — "
            "a lazy-__init__ package vanished from the freeze source; refusing to build a hollow exe (W13/W14)"
        )
    lazy_submodules += _mods

hiddenimports = webview_hiddenimports + http2_submodules + [
    "matplotlib",
    "pandas",
    "tiktoken._tiktoken",
    "grpc._cython.cygrpc",
    "cryptography.hazmat.bindings._rust",
    "numpy",
    "pandas._libs.lib",
    "lxml.etree",
    "PIL._imaging",
    "bcrypt._bcrypt",
    "faiss",
    "chromadb_rust_bindings",
    "tiktoken_ext",
    "tiktoken_ext.openai_public",
    "ruamel.yaml",
    "ruamel.yaml.reader",
    "ruamel.yaml.representer",
    "ruamel.yaml.nodes",
    "openjiuwen",
    "psutil",
    "aiosqlite",
    "croniter",
    "websockets",
    "loguru",
    "dotenv",
    "jiuwenswarm.channels.web.app_web",
    # [SD-D3 2] -m passthrough targets: start_services spawns children
    # as `<exe> -m <module>` -- runpy resolves them at RUNTIME, so each
    # must be an explicit hiddenimport (the static dispatcher surface
    # does not cover -m children).
    "jiuwenswarm.app",
    "jiuwenswarm.channels.web.app_web",
    "jiuwenswarm.server.app_agentserver",
    "jiuwenswarm.gateway.app_gateway",
] + openjiuwen_submodules + symphony_submodules + team_kv_cache_hiddenimports + dispatch_submodules + lazy_submodules

# [SD-D3 3] runtime hook: sitecustomize chain + CREATE_NO_WINDOW.
_sd_runtime_hook = os.path.join(SPEC_DIR, "sd_runtime_hook.py")

# [SD-D3 4] patch 0018 subtraction set, as excludes (upstream's own list
# preserved verbatim; SD additions appended with the 0018 marker).
excludes = [
    "tkinter",
    "scipy",
    "numpy.tests",
    "claude_agent_sdk",
    "openai_codex",
    "codex_cli_bin",
    "tox",
    "hypothesis",
    "mock",
    "coverage",
    "webview",              # [SD-D3 4] SD's Electron is the UI
    "playwright",           # [SD-D3 4] patch 0018 removed the dependency
    "uv",                   # [SD-D3 4] patch 0018 removed the dependency
]

# [SD-D3 2] SD's exec-entry dispatcher replaces upstream's entry; MCP
# entry dropped (divergence 6 -- see module docstring).
entry_script = os.path.join(SPEC_DIR, "sd_exec_entry.py")

icon_path = os.path.join(
    project_root, "jiuwenswarm", "channels", "web", "frontend", "public",
    "logo.ico" if sys.platform == "win32" else "logo.icns",
)

import sysconfig as _sysconfig
_bundled_binaries = []

# [SD-D3 4] matplotlib stays (paper reporting needs it) -- upstream collect.
_matplotlib_datas, _matplotlib_binaries, _matplotlib_hidden = collect_all("matplotlib")
datas += _matplotlib_datas
hiddenimports += _matplotlib_hidden
_bundled_binaries += _matplotlib_binaries

_ruff_suffix = ".exe" if sys.platform == "win32" else ""
_ruff_scripts_dir = _sysconfig.get_path("scripts")
_ruff_candidates = []
if _ruff_scripts_dir:
    _ruff_candidates.append(os.path.join(_ruff_scripts_dir, "ruff" + _ruff_suffix))
_exe_dir = os.path.dirname(sys.executable) if sys.executable else None
if _exe_dir:
    _scripts_subdir = "Scripts" if sys.platform == "win32" else "bin"
    _ruff_candidates.append(os.path.join(_exe_dir, _scripts_subdir, "ruff" + _ruff_suffix))
for _c in _ruff_candidates:
    if _c and os.path.isfile(_c):
        _bundled_binaries.append((_c, "."))
        break
if not _bundled_binaries:
    print("WARNING: ruff binary not found in venv; auto-harness lint will be "
          "unavailable in the frozen exe (install ruff in the build venv)")

_pytest_datas, _pytest_binaries, _pytest_hidden = collect_all("pytest")
_pa_datas, _pa_binaries, _pa_hidden = collect_all("pytest_asyncio")
_py_datas, _py_binaries, _py_hidden = collect_all("py")
datas += _pytest_datas + _pa_datas + _py_datas
hiddenimports += _pytest_hidden + _pa_hidden + _py_hidden
_bundled_binaries = _bundled_binaries + _pytest_binaries + _pa_binaries + _py_binaries
_mypy_datas, _mypy_binaries, _mypy_hidden = collect_all("mypy")
datas += _mypy_datas
hiddenimports += _mypy_hidden
_bundled_binaries = _bundled_binaries + _mypy_binaries
import glob as _glob
_mypyc_binaries = []
_sp_dir = _sysconfig.get_paths().get("purelib")
if _sp_dir:
    for _pyd in _glob.glob(os.path.join(_sp_dir, "*__mypyc*.pyd")):
        _mypyc_binaries.append((_pyd, "."))
_bundled_binaries = _bundled_binaries + _mypyc_binaries
_chroma_datas, _chroma_binaries, _chroma_hidden = collect_all("chromadb")
datas += _chroma_datas
hiddenimports += _chroma_hidden
_bundled_binaries += _chroma_binaries
_rust_datas, _rust_binaries, _rust_hidden = collect_all("chromadb_rust_bindings")
datas += _rust_datas
hiddenimports += _rust_hidden
_bundled_binaries += _rust_binaries

# [SD-D3 2] The dispatcher must know which tree it serves. The jw exe
# sets SD_EXEC_TREE via a tiny runtime pre-hook (env-based so the same
# dispatcher source serves the services spec unchanged).
_sd_tree_hook = os.path.join(SPEC_DIR, "_sd_tree_hook.py")
with open(_sd_tree_hook, "w", encoding="utf-8") as _fh:
    _fh.write('import os\nos.environ["SD_EXEC_TREE"] = "jw"\n')

a = Analysis(
    [entry_script],
    pathex=[project_root, symphony_root],
    binaries=_bundled_binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[_sd_tree_hook, _sd_runtime_hook],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="sd-jw",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # [SD-D3] SD spawns it as a managed child; console semantics match venv python
    icon=icon_path if os.path.isfile(icon_path) else None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="sd-jw",
)
