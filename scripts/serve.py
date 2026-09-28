"""Serve dist/ from a source checkout, using the portable server in ../serve.py."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from serve import main  # noqa: E402

if __name__ == "__main__":
    main(ROOT / "dist")
