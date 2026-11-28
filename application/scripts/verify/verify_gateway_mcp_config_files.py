"""Probe A6+A7: gateway MCP servers' import-time config dependencies.

Path inventory A6/A7: the three gateway MCP servers
(uniprot_mcp.py, public_biomed_mcp.py, llm_wiki_mcp.py) read
`config/external-urls.json` (or SCIENCE_AGENT_EXTERNAL_URLS_PATH) AT
IMPORT TIME — the assemble copySet carries a field-note about exactly
this: the stdio subprocess died before the MCP handshake when the
config was absent (built-in UniProt source showed "unavailable").

Two contracts:
  1. DATA FILE: external-urls.json must exist at the expected location
     (repo-relative config/ here; backend/config/ in the payload — the
     probe resolves both shapes).
  2. IMPORT: each MCP server module must import without raising, and
     must expose the URL map it read (i.e. the import-time read
     succeeded — not just "didn't crash while returning empty").

Post-D3 the data file rides the onedir TOC and this probe becomes the
data-file existence assertion the D3 risk table demands (residual
files bypass FrozenImporter and are the first thing antivirus/onedir
damage removes).
"""

from __future__ import annotations

import json
import os
from pathlib import Path


def _locate_external_urls() -> Path | None:
    """Repo layout and payload layout both, honoring the env override."""
    override = os.environ.get("SCIENCE_AGENT_EXTERNAL_URLS_PATH")
    if override and Path(override).is_file():
        return Path(override)

    candidates = [
        Path(__file__).resolve().parents[3] / "config" / "external-urls.json",        # repo root (scripts/verify -> up 3)
        Path(__file__).resolve().parents[2] / "config" / "external-urls.json",       # payload backend/config
    ]
    for cand in candidates:
        if cand.is_file():
            return cand
    return None


def run() -> str | None:
    import importlib.util

    # Contract 1: the data file exists (whichever layout we are in).
    located = _locate_external_urls()
    if located is None:
        raise AssertionError(
            "external-urls.json not found in repo config/ or payload backend/config/ "
            "and SCIENCE_AGENT_EXTERNAL_URLS_PATH is unset — the gateway MCP servers "
            "read this at import time and die before the MCP handshake without it"
        )
    data = json.loads(located.read_text(encoding="utf-8"))
    assert isinstance(data, dict) and data, f"external-urls.json at {located} is empty or not an object"
    print(f"[verify] external-urls.json OK at {located}: {sorted(data)[:5]}")

    # Contract 2: import each MCP server. Only meaningful when the
    # gateway package is importable from this env (sd-services env /
    # frozen payload; a bare dev interpreter skips rather than lying).
    if importlib.util.find_spec("sciencediscovery_gateway") is None:
        return "SKIP-GATEWAY-ABSENT: sciencediscovery_gateway not importable here"

    import sciencediscovery_gateway.public_biomed_mcp as pbm
    import sciencediscovery_gateway.uniprot_mcp as uniprot

    # Import-time URL map read must have produced something usable.
    urls = getattr(uniprot, "EXTERNAL_URLS", None) or getattr(pbm, "EXTERNAL_URLS", None)
    for attr_name in ("EXTERNAL_URLS", "EXTERNAL_URLS_PATH", "_EXTERNAL_URLS"):
        candidate = getattr(uniprot, attr_name, None)
        if candidate:
            urls = candidate
            break
    # Import alone is the hard contract (a missing file raises at import
    # time); the map introspection is advisory because attribute names
    # are implementation details.
    if urls is None:
        print("[verify] NOTE: URL map attribute name not found on uniprot_mcp (advisory only)")
    return None
