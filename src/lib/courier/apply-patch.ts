// ============================================================================
// SentinelQA — Apply patch to target repo and push branch
//
// Clones the target repo, applies the Healer's proposed_patch, and pushes
// so that createPullRequest can succeed. Used when Healer produces a fix.
// ============================================================================

import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export interface ApplyPatchOptions {
  owner: string;
  repo: string;
  baseBranch: string;
  headBranch: string;
  proposedPatch: string;
  sessionId: string;
  githubToken: string;
}

export interface ApplyPatchResult {
  success: boolean;
  error?: string;
}

/**
 * Clone target repo, apply patch, push branch.
 * Returns success/failure. On failure, caller should fall back to Issue.
 */
export function applyPatchAndPush(options: ApplyPatchOptions): ApplyPatchResult {
  const { owner, repo, baseBranch, headBranch, proposedPatch, sessionId, githubToken } = options;

  if (!githubToken?.trim()) {
    return { success: false, error: "GITHUB_PERSONAL_ACCESS_TOKEN required for PR creation" };
  }
  if (!proposedPatch?.trim()) {
    return { success: false, error: "proposed_patch is empty" };
  }

  const tmpDir = path.join(os.tmpdir(), `sentinelqa-${sessionId}-${Date.now()}`);
  const repoUrl = `https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git`;
  let patchPath: string | null = null;

  try {
    // 1. Clone
    execSync(`git clone --depth 1 --branch ${baseBranch} ${repoUrl} ${tmpDir}`, {
      timeout: 60000,
      stdio: "pipe",
    });

    // 2. Create branch
    execSync(`git checkout -b ${headBranch}`, { cwd: tmpDir, stdio: "pipe" });

    // 3. Write patch (normalize: remove escaped quotes that LLMs sometimes add)
    const normalizedPatch = proposedPatch
      .replace(/\\"/g, '"')
      .replace(/\\\\n/g, "\n");
    patchPath = path.join(tmpDir, "fix.patch");
    fs.writeFileSync(patchPath, normalizedPatch, "utf-8");

    // 4. Apply patch (dry run first)
    try {
      execSync(`git apply --check fix.patch`, { cwd: tmpDir, stdio: "pipe" });
    } catch (checkErr) {
      const msg = checkErr instanceof Error ? checkErr.message : String(checkErr);
      return { success: false, error: `Patch failed to apply: ${msg}` };
    }

    execSync(`git apply fix.patch`, { cwd: tmpDir, stdio: "pipe" });

    // 5. Commit if there are changes
    const status = execSync("git status --porcelain", { cwd: tmpDir, encoding: "utf-8" });
    if (status.trim()) {
      execSync("git add -A", { cwd: tmpDir, stdio: "pipe" });
      execSync(`git commit -m "[SentinelQA] Auto-fix for ${sessionId}"`, {
        cwd: tmpDir,
        stdio: "pipe",
      });
    }

    // 6. Push (--force overwrites if branch exists from prior run; fix branches are owned by SentinelQA)
    execSync(`git push --force -u origin ${headBranch}`, {
      cwd: tmpDir,
      stdio: "pipe",
      timeout: 30000,
    });

    return { success: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      if (patchPath && fs.existsSync(patchPath)) {
        fs.unlinkSync(patchPath);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}
