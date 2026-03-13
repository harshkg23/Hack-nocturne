#!/usr/bin/env bash
# Revert the intentional break in auth page.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AUTH_PAGE="$ROOT/src/app/auth/page.tsx"

if [[ ! -f "$AUTH_PAGE" ]]; then
  echo "Error: $AUTH_PAGE not found"
  exit 1
fi

if ! grep -q 'Sign-In-Broken' "$AUTH_PAGE"; then
  echo "No break to revert."
  exit 0
fi

# Portable sed (works on macOS and Linux)
if sed --version 2>/dev/null | grep -q GNU; then
  sed -i 's/Sign-In-Broken/Sign In/g' "$AUTH_PAGE"
else
  sed -i '' 's/Sign-In-Broken/Sign In/g' "$AUTH_PAGE"
fi
echo "✓ Reverted break: 'Sign-In-Broken' → 'Sign In'"
