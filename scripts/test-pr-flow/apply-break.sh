#!/usr/bin/env bash
# Apply intentional break to auth page for PR flow testing.
# Changes "Sign In" → "Sign-In-Broken" so tests fail and Healer can propose a fix.

set -e
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
AUTH_PAGE="$ROOT/src/app/auth/page.tsx"

if [[ ! -f "$AUTH_PAGE" ]]; then
  echo "Error: $AUTH_PAGE not found"
  exit 1
fi

# Only apply if not already broken
if grep -q 'Sign-In-Broken' "$AUTH_PAGE"; then
  echo "Break already applied."
  exit 0
fi

# Portable sed (works on macOS and Linux)
if sed --version 2>/dev/null | grep -q GNU; then
  sed -i 's/Sign In/Sign-In-Broken/g' "$AUTH_PAGE"
else
  sed -i '' 's/Sign In/Sign-In-Broken/g' "$AUTH_PAGE"
fi
echo "✓ Applied break: 'Sign In' → 'Sign-In-Broken' in auth page"
