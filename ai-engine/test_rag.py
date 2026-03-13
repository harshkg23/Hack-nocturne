"""
Quick smoke-test for the RAG memory pipeline.

Run from the ai-engine/ directory:
    python test_rag.py

What it does:
1. Stores a fake successful fix into sentinelqa.healer_memory
2. Immediately queries for the top-3 similar past fixes
3. Prints the retrieved docs so you can confirm the round-trip works
"""
import os
import sys
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

# ── sanity-check env vars ────────────────────────────────────────────────────
missing = [k for k in ("MONGODB_URI", "OPENAI_API_KEY") if not os.getenv(k)]
if missing:
    print(f"[ERROR] Missing env vars: {missing}")
    sys.exit(1)

print("✅ Env vars present")

# ── 1. STORE a fake fix ───────────────────────────────────────────────────────
from memory.store import store_successful_fix

fake_state = {
    "rca_type": "selector_mismatch",
    "rca_report": "The login button selector changed from #btn-login to #login-submit after the UI redesign.",
    "proposed_fix": "Update the Playwright selector to use the new ID.",
    "proposed_patch": (
        "--- a/tests/e2e/login.spec.ts\n"
        "+++ b/tests/e2e/login.spec.ts\n"
        "@@ -10,1 +10,1 @@\n"
        "-  await page.click('#btn-login');\n"
        "+  await page.click('#login-submit');\n"
    ),
    "target_files": ["tests/e2e/login.spec.ts"],
    "fix_branch": "fix/login-selector",
    "confidence_score": 0.91,
    "repo_url": "https://github.com/test/sentinelqa-demo",
    "git_diff": "- id='btn-login'\n+ id='login-submit'",
    "changed_files": ["src/components/LoginButton.tsx"],
}

print("\n📦 Storing fake fix...")
store_successful_fix(fake_state)
print("   Done (check logs above for any errors)")

# ── 2. RETRIEVE similar fixes ─────────────────────────────────────────────────
import time
print("\n⏳ Waiting 3 seconds for Atlas to index the new document...")
time.sleep(3)

from memory.retriever import get_similar_past_fixes

print("\n🔍 Querying for similar past fixes...")
results = get_similar_past_fixes(
    git_diff="- id='btn-login'\n+ id='login-submit'",
    changed_files=["src/components/LoginButton.tsx"],
    failed_tests=[{"error": "Timeout waiting for #btn-login to be visible"}],
    top_k=3,
)

print(f"\n✅ Retrieved {len(results)} result(s):\n")
for i, doc in enumerate(results, 1):
    print(f"  [{i}] rca_type      : {doc.get('rca_type')}")
    print(f"      rca_report    : {doc.get('rca_report', '')[:80]}...")
    print(f"      confidence    : {doc.get('confidence_score')}")
    print(f"      repo          : {doc.get('repo_url')}")
    print()

if not results:
    print("  ⚠️  No results — Atlas may need a few more seconds to index.")
    print("  Tip: run this script again in 10-15 seconds if the collection was empty before.")
