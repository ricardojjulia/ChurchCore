#!/usr/bin/env bash
set -euo pipefail

# Blocks obvious sensitive files from being staged by an AI-assisted workflow.

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  exit 0
fi

blocked_pattern='(^|/)(\.env[^/]*|secrets\.json|creds\.md|.*\.(key|pem|p12|pfx))$'

if git diff --cached --name-only | grep -E "$blocked_pattern" >/dev/null; then
  echo "BLOCKED: staged sensitive file detected." >&2
  git diff --cached --name-only | grep -E "$blocked_pattern" >&2
  exit 1
fi

exit 0
