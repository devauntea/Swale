#!/bin/sh
# swmm-toolkit 0.17.0's macOS arm64 wheel ships libomp.dylib and libswmm-output.dylib with invalid
# signatures, and Apple Silicon kills any process that loads them (exit 137, no error message).
# This re-signs them ad hoc inside this project's .venv only; nothing system-wide changes.
set -e
cd "$(dirname "$0")/.."
DIR=$(uv run python -c "import importlib.util, pathlib; print(pathlib.Path(importlib.util.find_spec('swmm.toolkit').origin).parent)")
codesign --force --sign - "$DIR"/*.dylib
uv run python -c "from swmm.toolkit import solver; print('SWMM loads:', solver.swmm_get_version())"
