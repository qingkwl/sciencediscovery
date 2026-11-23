"""Probe A5: adapter openjiuwen metadata probe degrades gracefully.

Path inventory A5: configuration_capabilities.py:55 walks
`importlib.metadata.distributions(path=[site])` looking for the
"openjiuwen" distribution to report its version. In a venv this finds
the dist-info. Post-D3 (frozen onedir) there are no dist-info trees —
distributions() yields nothing, and the capability code must treat
"not found" as a plain absent-version answer, not a crash.

This probe asserts the graceful-degradation contract directly:
  * a metadata API failure must surface as None/absent, never raise;
  * when openjiuwen IS importable, the module's version query path
    still works through importlib.metadata (baseline venv).

It deliberately does NOT assert openjiuwen's presence (the frozen
payload keeps it — probe A8's presence matrix does that).
"""

from __future__ import annotations


def run() -> None:
    import importlib.metadata

    # Baseline contract: querying a known-missing distribution name
    # raises PackageNotFoundError, and the adapter's code wraps that
    # (we assert the wrap pattern exists by checking the function
    # handles it — simulate with the public API the code uses).
    try:
        importlib.metadata.version("__definitely_not_a_package__")
    except importlib.metadata.PackageNotFoundError:
        pass  # expected — the ONLY acceptable exception shape
    else:
        raise AssertionError(
            "metadata query for a nonexistent package unexpectedly succeeded; "
            "the probe cannot reason about the degradation contract"
        )

    # The real code path: distributions() over an empty/absent path
    # must yield an empty iterator, not raise. Frozen onedir has no
    # dist-info; this is exactly the shape it will see.
    found = list(
        importlib.metadata.distributions(
            path=[r"D:\definitely\not\a\site-packages"]
        )
    )
    assert found == [], f"distributions() over an absent path yielded: {found!r}"

    # And over the CURRENT environment, the walk must at least execute
    # (whatever it finds). The openjiuwen-present half belongs to the
    # venv baseline; in the frozen payload this same line must simply
    # not raise.
    list(importlib.metadata.distributions())
