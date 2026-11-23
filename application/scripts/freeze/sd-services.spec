# -*- mode: python ; coding: utf-8 -*-
# Copyright (C) 2026-2026 Huawei Technologies Co., Ltd
r"""SD freeze spec for the sd-services tree (D3 P2-1).

Companion to sd-jw.spec; same thin-delta discipline. This tree has no
upstream spec of its own, so the shape follows the jw delta's proven
pattern instead:

  - entry: freeze/sd_exec_entry.py with SD_EXEC_TREE=services (set by
    the tree hook written below, same as the jw spec's)
  - entries (the REAL spawn contract, from start-stack.mjs / config.ts):
      evolve     -m sciencediscovery_evolve.server   (uvicorn FastAPI sidecar)
      gateway    stdio MCP trio (uniprot/public_biomed/llm_wiki)
      paper      paper_worker.py as a LOOSE FILE (runpy; -I contract needs
                 a real path -- same rule as the vendored puct runner,
                 probe A3)
      candidate  the evolve sandbox runner; -I semantics preserved
  - candidates four: collect_all numpy/pandas/scipy/scikit-learn (the
    A1 probe contract; sklearn's compiled core needs binaries+datas)
  - pdfplumber collected (pdfminer.six chain) for the paper worker

Divergence list vs the jw delta (this spec's six):
  1. venv: .sciencediscovery-data/envs/sd-services (the shared env)
  2. no jw gates (build_config sync / frontend dist) -- this tree has none
  3. excludes: the SAME subtraction set (0018 is jw-side; here the
     payload-slim sweep remains authoritative -- onnxruntime etc.)
  4. paper_worker.py + the vendored puct runner staged as loose files
     next to the exe (TOC datas, NOT the PYZ)
  5. matplotlib is NOT collected (absent in this venv; evolve scoring
     never imports it -- assertion in verify_evolve_candidate_runtime)
  6. name sd-services; console=True (managed child, same as jw)
"""

import os
import sys

from PyInstaller.utils.hooks import collect_all, collect_data_files, collect_submodules, copy_metadata

block_cipher = None

SPEC_DIR = os.path.abspath(globals().get("SPECPATH", os.getcwd()))
sd_repo_root = os.path.abspath(os.path.join(SPEC_DIR, "..", "..", ".."))
project_root = os.path.abspath(
    os.path.join(sd_repo_root, ".sciencediscovery-data", "envs", "sd-services")
)

_services_venv_scripts = os.path.join(project_root, "Scripts" if sys.platform == "win32" else "bin")
if os.path.abspath(os.path.dirname(sys.executable)) != os.path.abspath(_services_venv_scripts):
    raise SystemExit(
        f"SD-D3: run this spec with the sd-services venv python ({_services_venv_scripts}), not {sys.executable}"
    )

datas = []
binaries = []
hiddenimports = []

# --- first-party packages: the five sidecars, full submodule sweep ---
for pkg in (
    "sciencediscovery_evolve",
    "sciencediscovery_gateway",
    "sciencediscovery_adapter",
    "sciencediscovery_memory_graph",
):
    mods = collect_submodules(pkg)
    hiddenimports += mods
    datas += copy_metadata(pkg.replace("_", "-"), recursive=True)

# evolve engine deps with dynamic import surfaces (agentdescent ports)
hiddenimports += collect_submodules("agentdescent")

# --- candidates four (A1 contract): full collect_all, binaries+datas ---
for pkg in ("numpy", "pandas", "scipy", "sklearn"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h

# --- compiled cores the A1 probe touches (scipy.fft / sklearn extmath /
#     pandas _libs) are covered by collect_all above; explicit anyway ---
hiddenimports += [
    "scipy.fft",
    "sklearn.utils.extmath",
    "pandas._libs.lib",
]

# --- paper worker chain: pdfplumber + pdfminer.six ---
for pkg in ("pdfplumber", "pdfminer"):
    d, b, h = collect_all(pkg)
    datas += d
    binaries += b
    hiddenimports += h
hiddenimports += collect_submodules("pdfminer")

# --- FastAPI/uvicorn sidecar surface ---
hiddenimports += collect_submodules("uvicorn")
d, b, h = collect_all("pydantic")
datas += d
binaries += b
hiddenimports += h

# --- the vendored puct runner: LOOSE FILE (probe A3 / -I contract) ---
_vendor_dir = os.path.join(sd_repo_root, "services", "evolve", "src", "sciencediscovery_evolve", "vendor", "puct")
datas += [(_vendor_dir, "sciencediscovery_evolve/vendor/puct")]

# --- paper_worker.py: LOOSE FILE next to the exe (runpy file entry) ---
_paper_worker = os.path.join(sd_repo_root, "services", "paper", "paper_worker.py")
datas += [(_paper_worker, ".")]

# --- mcp metadata: only `mcp` (the gateway MCP modules import it);
# fastmcp is a jw-tree dependency, absent here by design (the first
# build failed on copy_metadata("fastmcp") -- PackageNotFoundError). ---
datas += copy_metadata("mcp", recursive=True)

# [SD-D3 4] subtraction set (matches the jw delta; payload-slim's sweep
# stays authoritative for anything else that sneaks in)
excludes = [
    "tkinter",
    "numpy.tests",
    "scipy.tests",
    "pandas.tests",
    "sklearn.tests",
    "matplotlib",       # [SD-D3 5] absent from this venv by design
    "onnxruntime",
    "kubernetes",
    "playwright",
    "uv",
    "webview",
    "tox",
    "hypothesis",
    "mock",
    "coverage",
    "pip",
]

# [SD-D3 1] tree marker: the dispatcher reads SD_EXEC_TREE=services
_sd_tree_hook = os.path.join(SPEC_DIR, "_sd_tree_hook_services.py")
with open(_sd_tree_hook, "w", encoding="utf-8") as _fh:
    _fh.write('import os\nos.environ["SD_EXEC_TREE"] = "services"\n')

_sd_runtime_hook = os.path.join(SPEC_DIR, "sd_runtime_hook.py")
entry_script = os.path.join(SPEC_DIR, "sd_exec_entry.py")

a = Analysis(
    [entry_script],
    pathex=[os.path.join(sd_repo_root, "services", "evolve", "src"),
            os.path.join(sd_repo_root, "services", "gateway", "src"),
            os.path.join(sd_repo_root, "services", "adapter", "src"),
            os.path.join(sd_repo_root, "services", "memory-graph", "src")],
    binaries=binaries,
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
    name="sd-services",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,  # [SD-D3 6] managed child, console semantics match venv python
    icon=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    name="sd-services",
)
