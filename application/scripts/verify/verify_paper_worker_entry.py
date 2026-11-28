"""Probe A8: paper_worker entry imports and core machinery works.

Path inventory A8: services/paper/paper_worker.py is a standalone Node-
spawned entry (pdfplumber-based PDF extraction). The spawn contract
(D3 P1-3/P2-2) freezes it as an exec-entry; this probe asserts the
import-time contract on whichever env it runs in:

  * pdfplumber imports (its compiled chain: pdfminer six-part, PIL,
    cryptography... a pyd/DLL miss surfaces as ImportError here);
  * the worker module itself imports without side effects (argparse
    must NOT have run — import safety).

The worker source itself is NOT importable as a package module (it
lives at services/paper/paper_worker.py outside any package). This
probe therefore asserts the library contract (pdfplumber) plus a
light syntax/compile check of the worker source file — the same
distinction the spawn contract makes: the entry is a file, the
libraries are the import graph.
"""

from __future__ import annotations

import ast
from pathlib import Path


def run() -> None:
    # Contract 1: pdfplumber's compiled chain imports cleanly.
    import pdfplumber

    assert hasattr(pdfplumber, "open"), "pdfplumber import returned a hollow module"

    # Contract 2: the worker entry file parses (a syntax error in the
    # entry = instant spawn failure with a confusing traceback).
    here = Path(__file__).resolve()
    for rel in (
        here.parents[3] / "services" / "paper" / "paper_worker.py",   # repo layout
        here.parents[2] / "services" / "paper" / "paper_worker.py",  # payload layout
    ):
        if rel.is_file():
            ast.parse(rel.read_text(encoding="utf-8"), filename=str(rel))
            print(f"[verify] paper_worker.py parses OK ({rel})")
            return

    raise AssertionError("paper_worker.py not found in either repo or payload layout")
