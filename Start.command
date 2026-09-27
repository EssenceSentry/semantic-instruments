#!/bin/sh
cd "$(dirname "$0")"
exec python3 serve.py --directory site --port "${1:-8773}"
