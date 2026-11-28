"""Probe A1: evolve candidate runtime — numpy/pandas/scipy/sklearn.

Path inventory A1 (P0-dynamic-paths.md): measurement.py pins
_CANDIDATE_RUNTIME = ("numpy", "pandas", "scipy", "sklearn") and checks
it once at run start via find_spec. A candidate program runs with THIS
process's interpreter, so whatever environment this probe runs in is
the environment the evolve gate makes promises about. After D3, the
frozen sd-services onedir must have all four importable AND their
compiled extensions loadable (a collect_all miss would surface here
as ModuleNotFoundError or ImportError: DLL load failed).
"""

from __future__ import annotations


def run() -> None:
    import importlib.util

    runtime = ("numpy", "pandas", "scipy", "sklearn")
    missing = [name for name in runtime if importlib.util.find_spec(name) is None]
    assert not missing, f"evolve candidate runtime missing modules: {missing}"

    # find_spec is not enough: a collect_all that ships the pure-Python
    # part but drops the .pyd would pass find_spec and die at import.
    import numpy
    import pandas
    import scipy
    import sklearn

    # Touch the compiled core of each so a DLL/pyd miss fails HERE,
    # not on a user's first evolve run. numpy 2.x moved the compiled
    # test module to _core._multiarray_umath; 1.x had _core._multiarray_tests —
    # probe the 2.x layout (this payload pins numpy>=1.26 via lock, and
    # the lock resolved 2.5.4; if a future lock bumps break this, the
    # failure names exactly what moved).
    import numpy._core._multiarray_umath as _mau
    assert getattr(_mau, "_ARRAY_API", None) is not None, "numpy._core._multiarray_umath is hollow"
    import scipy.fft  # compiled path
    import sklearn.utils.extmath  # compiled path

    assert hasattr(numpy, "__version__"), "numpy import returned a hollow module"
    assert hasattr(pandas, "DataFrame"), "pandas import returned a hollow module"
    assert hasattr(scipy, "fft"), "scipy import returned a hollow module"
    assert hasattr(sklearn, "__version__"), "sklearn import returned a hollow module"
