#!/usr/bin/env bash
# Run the SentinelQA pipeline against Hack-nocturne.
# Requires: AI engine on :8000, Next.js on :3000

set -e
OWNER="${OWNER:-harshkg23}"
REPO="${REPO:-Hack-nocturne}"
TARGET_URL="${TARGET_URL:-http://localhost:3000}"

echo "Running pipeline: $OWNER/$REPO → $TARGET_URL"
echo ""

curl -s -X POST http://localhost:3000/api/agent/pipeline \
  -H "Content-Type: application/json" \
  -d "{\"owner\":\"$OWNER\",\"repo\":\"$REPO\",\"target_url\":\"$TARGET_URL\"}" \
  | jq '.' 2>/dev/null || cat
