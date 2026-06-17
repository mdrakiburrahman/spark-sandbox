"""Pytest configuration for `dbt-runner-lib` unit tests."""

import sys
from pathlib import Path

# Make the in-tree src/ importable even before an editable install.
_SRC = Path(__file__).resolve().parents[1] / "src"
if str(_SRC) not in sys.path:
    sys.path.insert(0, str(_SRC))
