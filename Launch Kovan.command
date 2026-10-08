#!/bin/zsh
set -eu
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "$(dirname -- "$0")"
if ! command -v node >/dev/null 2>&1; then
  print "Kovan needs Node.js 24 or newer. Install it from https://nodejs.org, then open this launcher again."
  read -r "?Press Return to close."
  exit 1
fi
if ! node scripts/start.mjs; then
  print "See START-HERE.md for setup and troubleshooting."
  read -r "?Press Return to close."
  exit 1
fi
