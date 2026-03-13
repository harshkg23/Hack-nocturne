# Test PR Flow — SentinelQA Self-Healing Demo

This folder helps you test the **PR creation path** of the SentinelQA pipeline:
break something → run tests → Healer proposes fix → Courier creates PR.

## Prerequisites

1. **AI engine** running: `cd ai-engine && source .venv/bin/activate && python server.py`
2. **Next.js** running: `npm run dev`
3. **GitHub PAT** with `repo` scope in `.env` (`GITHUB_PERSONAL_ACCESS_TOKEN`)
4. **Push access** to the target repo (e.g. `harshkg23/Hack-nocturne` or your fork)

## Quick Start

```bash
# 1. Apply the intentional break (changes "Sign In" → "Sign-In-Broken" in auth page)
./scripts/test-pr-flow/apply-break.sh

# 2. Commit and push (required so GitHub API can fetch the diff)
git add src/app/auth/page.tsx
git commit -m "test: intentional break for SentinelQA PR flow demo"
git push origin main

# 3. Run the pipeline against Hack-nocturne
./scripts/test-pr-flow/run-pipeline.sh

# 4. Revert the break when done
./scripts/test-pr-flow/revert-break.sh
git add src/app/auth/page.tsx && git commit -m "revert: demo break" && git push
```

## What Happens

1. **Break**: Auth page shows "Sign-In-Broken" instead of "Sign In"
2. **Tests fail**: Test plan asserts "Sign In" or "login form" → assertion fails
3. **Healer**: Runs RCA, may propose patch to revert the break
4. **Courier**: If confidence > 0.8 and patch is valid → clones repo, applies patch, pushes branch, creates PR

## Customizing Owner/Repo

Get your owner from: `git remote get-url origin` (e.g. `github.com/USER/Hack-nocturne` → `USER`)

Edit `scripts/test-pr-flow/run-pipeline.sh` or pass env vars:

```bash
OWNER=youruser REPO=Hack-nocturne ./scripts/test-pr-flow/run-pipeline.sh
```

Default: `harshkg23/Hack-nocturne` (from origin).
