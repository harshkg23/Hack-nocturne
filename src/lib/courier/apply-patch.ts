// ============================================================================
// SentinelQA — Apply patch to target repo and push branch
//
// Uses the GitHub REST API (get file → patch → commit) to avoid the slow
// git clone/push approach that causes 502 timeouts in the HTTP chain.
// ============================================================================

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

// ---------------------------------------------------------------------------
// Parse a unified diff and apply it to file contents via string replacement.
// ---------------------------------------------------------------------------
function applyUnifiedDiff(original: string, patch: string): string | null {
  let result = original.replace(/\r\n/g, "\n"); // normalise to LF

  const hunkRe = /^@@[^@@]*@@[^\n]*\n([\s\S]*?)(?=\n@@|\ndiff |$)/gm;
  let hunk: RegExpExecArray | null;
  let appliedCount = 0;

  while ((hunk = hunkRe.exec(patch)) !== null) {
    const hunkBody = hunk[1];
    const removedLines: string[] = [];
    const addedLines: string[] = [];

    for (const line of hunkBody.split("\n")) {
      if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines.push(line.slice(1));
      } else if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines.push(line.slice(1));
      }
    }

    if (removedLines.length === 0) continue; // pure-add hunk; skip

    const needle = removedLines.join("\n");
    const replacement = addedLines.join("\n");
    const idx = result.indexOf(needle);

    if (idx === -1) {
      console.warn(`[PatchApply] Hunk lines not found in file:\n${needle}`);
      continue;
    }

    result = result.slice(0, idx) + replacement + result.slice(idx + needle.length);
    appliedCount++;
    console.log(`[PatchApply] Applied hunk ${appliedCount}`);
  }

  return appliedCount > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// GitHub REST API helpers
// ---------------------------------------------------------------------------
async function ghGet(url: string, token: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

async function ghPut(url: string, token: string, body: object) {
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${url} → ${res.status} ${await res.text()}`);
  return res.json();
}

/**
 * Create (or update) a branch ref via GitHub API.
 */
async function ensureBranch(
  owner: string,
  repo: string,
  headBranch: string,
  baseBranch: string,
  token: string
): Promise<void> {
  // Get the SHA of the base branch HEAD
  const baseData = await ghGet(
    `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${baseBranch}`,
    token
  );
  const baseSha: string = baseData.object.sha;

  // Try to create the new branch
  const createRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/refs`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ ref: `refs/heads/${headBranch}`, sha: baseSha }),
    }
  );

  if (createRes.status === 422) {
    // Branch already exists — force-update it
    await fetch(
      `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${headBranch}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({ sha: baseSha, force: true }),
      }
    );
  } else if (!createRes.ok) {
    throw new Error(`Failed to create branch: ${createRes.status} ${await createRes.text()}`);
  }
}

/**
 * Apply the Healer's patch directly via GitHub API.
 * No git clone required — fast and reliable.
 */
export async function applyPatchAndPush(options: ApplyPatchOptions): Promise<ApplyPatchResult> {
  const { owner, repo, baseBranch, headBranch, proposedPatch, sessionId, githubToken } = options;

  if (!githubToken?.trim()) {
    return { success: false, error: "GITHUB_PERSONAL_ACCESS_TOKEN required for PR creation" };
  }
  if (!proposedPatch?.trim()) {
    return { success: false, error: "proposed_patch is empty" };
  }

  const normalizedPatch = proposedPatch.replace(/\\\"/g, '"').replace(/\\\\n/g, "\n");

  // Find all files that the patch touches
  const fileHeaderRe = /^diff --git a\/(.*?) b\/(.*?)$/gm;
  const fileSections = normalizedPatch.split(/(?=^diff --git )/m);
  let patchedFiles = 0;

  // Ensure the fix branch exists (based on the base branch)
  try {
    await ensureBranch(owner, repo, headBranch, baseBranch, githubToken);
  } catch (err) {
    return { success: false, error: `Failed to create/update branch: ${String(err)}` };
  }

  for (const section of fileSections) {
    fileHeaderRe.lastIndex = 0;
    const fileMatch = fileHeaderRe.exec(section);
    if (!fileMatch) continue;

    const filePath = fileMatch[2];

    // 1. Fetch current file content + SHA from the HEAD branch
    let fileData: { content: string; sha: string };
    try {
      fileData = await ghGet(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}?ref=${headBranch}`,
        githubToken
      );
    } catch (err) {
      console.warn(`[PatchApply] Could not fetch ${filePath}: ${err}`);
      continue;
    }

    // GitHub returns content as base64
    const original = Buffer.from(fileData.content, "base64").toString("utf-8");
    const patched = applyUnifiedDiff(original, section);

    if (patched === null) {
      console.warn(`[PatchApply] String-replace failed for ${filePath}`);
      continue;
    }

    // 2. Commit the patched file directly via GitHub API
    try {
      await ghPut(
        `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`,
        githubToken,
        {
          message: `[SentinelQA] Auto-fix: ${sessionId}`,
          content: Buffer.from(patched, "utf-8").toString("base64"),
          sha: fileData.sha,
          branch: headBranch,
        }
      );
      console.log(`[PatchApply] ✅ Committed via API: ${filePath}`);
      patchedFiles++;
    } catch (err) {
      console.warn(`[PatchApply] Commit failed for ${filePath}: ${err}`);
    }
  }

  if (patchedFiles === 0) {
    return {
      success: false,
      error: "No files could be patched (context lines not found in current file)",
    };
  }

  return { success: true };
}
