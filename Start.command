#!/bin/sh
# Double-click in Finder to serve the lab from site/ and open it in the default browser.
# From a terminal, an optional argument sets the first port to try: ./Start.command 8775
cd "$(dirname "$0")" || exit 1
if ! python3 -c 'import sys; sys.exit(sys.version_info < (3, 7))' >/dev/null 2>&1; then
  echo "Semantic Instruments needs Python 3."
  echo "If macOS offers to install the command line developer tools, accept, then open Start.command again."
  printf 'Press Return to close this window. '
  read -r _
  exit 1
fi
python3 serve.py --directory site --port "${1:-8773}" --open
status=$?
if [ "$status" -ne 0 ]; then
  printf '\nThe lab could not start. Press Return to close this window. '
  read -r _
fi
exit "$status"
