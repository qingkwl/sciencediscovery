"""Probe (P1-2, frozen-target): frozen onedir manifest audit.

Runs against a FROZEN onedir (SD_VERIFY_TARGET=frozen): asserts both
directions of the freeze contract on the artifacts themselves:

  1. PYZ archive contains the critical DYNAMIC-path modules that a
     static Analysis cannot infer (W6 chain, adapter patch chain,
     openjiuwen deep modules, -m child targets). Parsed via PyInstaller's
     CArchiveReader against the exe (the PYZ rides inside it in onedir
     builds).
  2. Subtraction contract: playwright/webview/onnxruntime/kubernetes/
     tkinter must be ABSENT from the onedir (0018 + sweep shape).
  3. Presence contract: the babel-chain data dirs and openjiuwen/
     chromadb/matplotlib/certifi must be present (loose files or PYZ).
  4. pip must NOT resolve in the frozen tree (G0).

The frozen run needs the build venv's PyInstaller for archive parsing;
when importable, this probe self-skips with SKIP-FROZEN-ONLY on non-
frozen targets (venv/dev) — the venv baseline half lives in
verify_package_presence_matrix instead.

Path inventory mapping: A2 (G0 pip), C1/C2 (W6 chain), A4 (patch
chain), B-area (0018 subtraction).
"""

from __future__ import annotations

import importlib.util
from pathlib import Path


def _locate_onedir() -> Path | None:
    """The frozen onedir: SD_FROZEN_DIST env (the assemble-integration
    channel) wins; otherwise walk every ancestor of this probe plus the
    cwd for a dist layout (dist/sd-jw, <any>/sd-jw)."""
    import os

    env_dir = os.environ.get("SD_FROZEN_DIST")
    if env_dir:
        p = Path(env_dir)
        if (p / "sd-jw.exe").is_file():
            return p
        if (p / "sd-jw" / "sd-jw.exe").is_file():
            return p / "sd-jw"

    here = Path(__file__).resolve()
    bases = list(here.parents)
    bases.append(Path.cwd())
    for base in bases:
        for name in ("sd-jw", "sd-services"):
            exe_name = "sd-jw.exe" if name == "sd-jw" else "sd-services.exe"
            cand = base / name
            if (cand / exe_name).is_file():
                return cand
    return None


def run() -> str | None:
    target = __import__("verify_lib").target()
    if target != "frozen":
        return "SKIP-FROZEN-ONLY: frozen manifest audit runs on the onedir only"

    onedir = _locate_onedir()
    if onedir is None:
        raise AssertionError("frozen target but no sd-jw/ onedir found near the probe")

    internal = onedir / "_internal"
    assert internal.is_dir(), f"no _internal under {onedir}"

    # --- Contract 2: subtraction (0018 + sweep shape) ---
    for pkg in ("playwright", "webview", "onnxruntime", "kubernetes", "tkinter"):
        hits = list(internal.glob(f"{pkg}*"))
        assert not hits, f"subtraction violation: {pkg} present in onedir: {[h.name for h in hits[:3]]}"

    # --- Contract 3: presence (data dirs / dist-info / pyd trees) ---
    for pkg in ("openjiuwen", "babel", "courlan", "trafilatura", "chromadb",
                "certifi", "matplotlib", "lxml"):
        hits = list(internal.glob(f"{pkg}*"))
        assert hits, f"presence violation: {pkg} absent from onedir _internal"

    # --- Contract 4: G0 — pip must not resolve ---
    assert importlib.util.find_spec("pip") is None, (
        "G0 violation: pip resolves inside the frozen payload"
    )

    # --- Contract 1: PYZ members via CArchiveReader ---
    try:
        import PyInstaller  # noqa: F401
    except ImportError:
        return "SKIP-PYINSTALLER-ABSENT: manifest member audit needs the build venv"
    from PyInstaller.archive.readers import CArchiveReader

    exe = onedir / "sd-jw.exe"
    arch = CArchiveReader(str(exe))
    pyz_entry = next((k for k in arch.toc if k.endswith("PYZ.pyz")), None)
    assert pyz_entry, "no PYZ.pyz inside the exe CArchive"
    buf = arch.extract(pyz_entry)
    buf = buf[1] if isinstance(buf, tuple) else buf
    import marshal
    import struct

    assert buf[:4] == b"PYZ\x00", f"bad PYZ magic: {buf[:4]!r}"
    tocpos = struct.unpack("!I", buf[8:12])[0]
    toc = marshal.loads(buf[tocpos:])
    names = set(e[0] for e in toc)

    must_have = [
        # W6 chain (C1/C2)
        "trafilatura", "courlan", "babel",
        # adapter patch chain (A4)
        "jiuwenswarm.server.runtime.mcp.call_timeout_patch",
        "jiuwenswarm.server.runtime.agent_adapter.interface_deep",
        # -m child targets (start_services spawns)
        "jiuwenswarm.app",
        "jiuwenswarm.server.app_agentserver",
        "jiuwenswarm.gateway.app_gateway",
        # openjiuwen deep modules (B-area lazy patches 0010/0015/0016)
        "openjiuwen.core.runner.callback",
        "openjiuwen.extensions.external_provider.openai_auth.openai_account_auth",
        # A1b-critical third parties
        "chromadb", "tiktoken_ext.openai_public",
    ]
    missing = [m for m in must_have if m not in names and not any(n.startswith(m + ".") for n in names)]
    assert not missing, f"PYZ missing dynamic-path modules: {missing}"

    return f"PASS: frozen manifest audited ({len(names)} PYZ modules, subtraction+presence+G0+dynamic-chain green)"
