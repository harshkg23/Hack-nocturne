import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { exec, execSync } from "child_process";

// ─── Config Loading ───────────────────────────────────────────────────────────

function loadConfig() {
  const configPath = path.join(process.cwd(), "sentinelqa.config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  return JSON.parse(raw);
}

function run(cmd: string): string {
  try {
    return execSync(cmd, { timeout: 15000 }).toString().trim();
  } catch {
    return "";
  }
}

// ─── Slack Helper (inline — avoids server-only import issue in route) ────────

async function sendSlackNotification(text: string, blocks?: any[]) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) {
    console.warn("[Slack] No webhook URL set");
    return;
  }
  try {
    const payload: any = { text };
    if (blocks) payload.blocks = blocks;
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    console.log("[Slack] ✅ Notification sent");
  } catch (err) {
    console.error("[Slack] Failed:", err);
  }
}

// ─── GitHub Issue Helper (direct REST — no MCP overhead) ─────────────────────

async function createGitHubIssue(title: string, body: string, _labels: string[] = []) {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  const owner = "harshkg23";
  const repo = "Hack-nocturne";
  if (!token) {
    console.warn("[GitHub] No PAT set");
    return null;
  }
  try {
    // Note: don't send labels — some PATs lack label permissions and get 403
    const payload: any = { title, body };
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      console.log(`[GitHub] ✅ Issue #${data.number} created: ${data.html_url}`);
      return { number: data.number, url: data.html_url };
    } else {
      const errText = await res.text();
      console.error(`[GitHub] Issue creation failed (${res.status}): ${errText}`);
      return null;
    }
  } catch (err) {
    console.error("[GitHub] Failed:", err);
    return null;
  }
}

// ─── GET: Real data from kubectl, git ────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const podName = searchParams.get("pod");
  const wantCommits = searchParams.get("commits");

  // ── On-demand log fetch for a specific pod ────────────────────────────────
  if (podName) {
    const logs = run(`kubectl logs -n sentinelqa ${podName} --tail=80 2>/dev/null`);
    return NextResponse.json({ success: true, logs: logs || "(no logs yet)" });
  }

  // Helper to fetch commits from upstream
  const fetchGithubCommits = async (limit = 15) => {
    const owner = "harshkg23";
    const repo = "Hack-nocturne";
    const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
    const headers: Record<string, string> = { "User-Agent": "SentinelQA" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const gRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/commits?per_page=${limit}`, { headers, next: { revalidate: 5 } });
      if (gRes.ok) return await gRes.json();
    } catch (e) {}
    return [];
  };

  // ── Return recent commits for the commit picker ───────────────────────────
  if (wantCommits === "true") {
    const ghCommits = await fetchGithubCommits(15);
    const commits = ghCommits.map((c: any) => {
      const fullHash = c.sha;
      const hash = fullHash.substring(0, 7);
      const message = c.commit.message.split("\n")[0];
      const time = new Date(c.commit.author.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const author = c.commit.author.name;
      return { hash, message, time, author, fullHash };
    });
    return NextResponse.json({ success: true, commits });
  }

  // ── Full cluster status (main poll) ───────────────────────────────────────
  try {
    const config = loadConfig();

    // ── Git info (upstream) ──
    const latestGhCommits = await fetchGithubCommits(1);
    let latestCommit = "unknown";
    let commitHash = "unknown";
    if (latestGhCommits.length > 0) {
      const c = latestGhCommits[0];
      commitHash = c.sha.substring(0, 7);
      const msg = c.commit.message.split("\n")[0];
      const time = new Date(c.commit.author.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      latestCommit = `${commitHash} - ${msg} (${time})`;
    }

    // ── Real pod status from kubectl ──
    const podsRaw = run("kubectl get pods -n sentinelqa -o json");
    let pods: any[] = [];
    try { pods = JSON.parse(podsRaw)?.items || []; } catch { /* */ }

    // ── Real deployment status ──
    const deploymentsRaw = run("kubectl get deployments -n sentinelqa -o json");
    let deployments: any[] = [];
    try { deployments = JSON.parse(deploymentsRaw)?.items || []; } catch { /* */ }

    // ── Real events from k8s ──
    const eventsRaw = run("kubectl get events -n sentinelqa --sort-by=.lastTimestamp -o json 2>/dev/null");
    let k8sEvents: any[] = [];
    try { k8sEvents = (JSON.parse(eventsRaw)?.items || []).slice(-25); } catch { /* */ }

    // ── Real metrics from kubectl top ──
    const metricsRaw = run("kubectl top pods -n sentinelqa --no-headers 2>/dev/null");

    // ── Build structured response ──
    const podStates = pods.map((pod: any) => ({
      name: pod.metadata?.name || "unknown",
      track: pod.metadata?.labels?.track || pod.metadata?.labels?.app || "unknown",
      status: pod.status?.phase || "Unknown",
      ready: pod.status?.containerStatuses?.[0]?.ready || false,
      restarts: pod.status?.containerStatuses?.[0]?.restartCount || 0,
      image: pod.spec?.containers?.[0]?.image || "unknown",
      startedAt: pod.status?.startTime || "",
      reason: pod.status?.containerStatuses?.[0]?.state?.waiting?.reason || "",
    }));

    const deploymentStates = deployments.map((dep: any) => ({
      name: dep.metadata?.name || "unknown",
      track: dep.metadata?.labels?.track || dep.metadata?.labels?.app || "unknown",
      replicas: dep.spec?.replicas || 0,
      readyReplicas: dep.status?.readyReplicas || 0,
      availableReplicas: dep.status?.availableReplicas || 0,
      updatedReplicas: dep.status?.updatedReplicas || 0,
      image: dep.spec?.template?.spec?.containers?.[0]?.image || "unknown",
    }));

    // Parse metrics
    const metrics: Record<string, { cpu: string; memory: string }> = {};
    if (metricsRaw) {
      for (const line of metricsRaw.split("\n")) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          metrics[parts[0]] = { cpu: parts[1], memory: parts[2] };
        }
      }
    }

    // Parse k8s events
    const events = k8sEvents.map((ev: any) => ({
      timestamp: ev.lastTimestamp || ev.metadata?.creationTimestamp || "",
      type: ev.type === "Warning" ? "warning" : ev.type === "Normal" ? "info" : "error",
      reason: ev.reason || "",
      message: `[${ev.involvedObject?.name || "?"}] ${ev.message || ""}`,
      count: ev.count || 1,
    }));

    // Determine canary status
    const stableDep = deploymentStates.find((d: any) => d.track === "stable");
    const canaryDep = deploymentStates.find((d: any) => d.track === "canary");
    const totalReplicas = (stableDep?.replicas || 0) + (canaryDep?.replicas || 0);
    const canaryPercent = totalReplicas > 0 ? Math.round(((canaryDep?.replicas || 0) / totalReplicas) * 100) : 0;

    let overallStatus = "idle";
    if (canaryDep && canaryDep.replicas > 0 && canaryDep.readyReplicas > 0) {
      overallStatus = "canary_active";
    } else if (canaryDep && canaryDep.replicas > 0 && canaryDep.readyReplicas === 0) {
      overallStatus = "deploying";
    } else if (stableDep && stableDep.readyReplicas > 0 && (!canaryDep || canaryDep.replicas === 0)) {
      overallStatus = "stable_only";
    }

    // ── Detect unhealthy canary pods ──
    const canaryPods = podStates.filter((p: any) => p.track === "canary");
    const unhealthyCanary = canaryPods.filter(
      (p: any) =>
        p.reason === "CrashLoopBackOff" ||
        p.reason === "ImagePullBackOff" ||
        p.reason === "ErrImagePull" ||
        p.restarts > 3 ||
        (!p.ready && p.status !== "Pending")
    );

    return NextResponse.json({
      success: true,
      data: {
        config,
        latest_commit: latestCommit,
        commit_hash: commitHash,
        overall_status: overallStatus,
        canary_traffic_percent: canaryPercent,
        pods: podStates,
        deployments: deploymentStates,
        metrics,
        events,
        unhealthy_canary: unhealthyCanary,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to load deployment state", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ─── POST: Trigger REAL deployment actions ────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, commit_hash } = body;
    const scriptPath = path.join(process.cwd(), "scripts", "canary-deploy.sh");

    switch (action) {
      case "deploy": {
        if (commit_hash) {
          const checkout = run(`git stash && git checkout ${commit_hash} 2>&1`);
          console.log(`[deploy] checked out ${commit_hash}: ${checkout}`);
        }
        const output = await runScript(`"${scriptPath}" start`);

        // Send Slack notification
        void sendSlackNotification(
          `🚀 Canary Deployment Started`,
          [
            { type: "header", text: { type: "plain_text", text: "🚀 Canary Deployment Started", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: `*Commit:* \`${commit_hash || "HEAD"}\`\n*Namespace:* sentinelqa\n*Strategy:* Canary (33% traffic)` } },
            { type: "context", elements: [{ type: "mrkdwn", text: `Triggered at <!date^${Math.floor(Date.now() / 1000)}^{date_short} at {time}|${new Date().toISOString()}>` }] },
          ]
        );

        return NextResponse.json({
          success: true,
          data: {
            action: "deploy",
            message: commit_hash ? `Deploying from commit ${commit_hash}` : "Deploying from current HEAD",
            deployed_commit: commit_hash || "HEAD",
            output: output.substring(0, 3000),
          },
        });
      }

      case "promote": {
        const output = await runScript(`"${scriptPath}" promote`);

        void sendSlackNotification(
          `✅ Canary Promoted to 100%`,
          [
            { type: "header", text: { type: "plain_text", text: "✅ Canary Promoted to Stable", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: "The canary deployment has been promoted to 100% traffic. All stable pods now run the new version." } },
            { type: "context", elements: [{ type: "mrkdwn", text: `Promoted at <!date^${Math.floor(Date.now() / 1000)}^{date_short} at {time}|${new Date().toISOString()}>` }] },
          ]
        );

        return NextResponse.json({
          success: true,
          data: { action: "promote", message: "Canary promoted to stable", output: output.substring(0, 3000) },
        });
      }

      case "rollback": {
        const output = await runScript(`"${scriptPath}" rollback`);

        void sendSlackNotification(
          `⚠️ Canary Rolled Back`,
          [
            { type: "header", text: { type: "plain_text", text: "⚠️ Canary Rolled Back", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: "The canary deployment has been rolled back. Canary pods scaled to 0. Stable pods remain unchanged." } },
            { type: "context", elements: [{ type: "mrkdwn", text: `Rolled back at <!date^${Math.floor(Date.now() / 1000)}^{date_short} at {time}|${new Date().toISOString()}>` }] },
          ]
        );

        return NextResponse.json({
          success: true,
          data: { action: "rollback", message: "Rollback complete — canary scaled to 0", output: output.substring(0, 3000) },
        });
      }

      case "diagnose": {
        const failingPods = run(
          'kubectl get pods -n sentinelqa -l track=canary -o jsonpath=\'{range .items[*]}{.metadata.name}{"\\n"}{end}\''
        );
        const podNames = failingPods.split("\n").filter(Boolean);
        const diagnostics: Record<string, string> = {};
        for (const pod of podNames) {
          const logs = run(`kubectl logs -n sentinelqa ${pod} --tail=80 2>/dev/null`);
          const describe = run(`kubectl describe pod ${pod} -n sentinelqa 2>/dev/null | tail -30`);
          diagnostics[pod] = `=== LOGS ===\n${logs}\n\n=== DESCRIBE ===\n${describe}`;
        }
        return NextResponse.json({ success: true, data: { action: "diagnose", pods: podNames, diagnostics } });
      }

      case "test_canary": {
        const checks: { name: string; status: "pass" | "fail"; detail: string }[] = [];

        const canaryPodsRaw = run("kubectl get pods -n sentinelqa -l track=canary -o json");
        let canaryPods: any[] = [];
        try { canaryPods = JSON.parse(canaryPodsRaw)?.items || []; } catch { /* */ }

        if (canaryPods.length === 0) {
          checks.push({ name: "Canary Pod Exists", status: "fail", detail: "No canary pods found in the cluster" });
        } else {
          checks.push({ name: "Canary Pod Exists", status: "pass", detail: `${canaryPods.length} canary pod(s) found` });
        }

        for (const pod of canaryPods) {
          const name = pod.metadata?.name || "unknown";
          const ready = pod.status?.containerStatuses?.[0]?.ready || false;
          const reason = pod.status?.containerStatuses?.[0]?.state?.waiting?.reason || "";
          const restarts = pod.status?.containerStatuses?.[0]?.restartCount || 0;
          checks.push({
            name: `Pod Ready: ${name}`,
            status: ready ? "pass" : "fail",
            detail: ready ? "Container is ready and serving traffic" : `Not ready: ${reason || "initializing"} (restarts: ${restarts})`,
          });
        }

        for (const pod of canaryPods) {
          const podIP = pod.status?.podIP || "";
          if (podIP) {
            const healthResult = run(
              `kubectl exec -n sentinelqa ${pod.metadata.name} -- wget -qO- http://localhost:3000/api/health 2>/dev/null || echo "HEALTH_CHECK_FAILED"`
            );
            checks.push({
              name: `Health Endpoint: ${pod.metadata.name}`,
              status: healthResult.includes("HEALTH_CHECK_FAILED") ? "fail" : "pass",
              detail: healthResult.includes("HEALTH_CHECK_FAILED") ? "HTTP health check failed" : `Response: ${healthResult.substring(0, 200)}`,
            });
          }
        }

        for (const pod of canaryPods) {
          const img = pod.spec?.containers?.[0]?.image || "";
          checks.push({ name: `Image: ${pod.metadata?.name}`, status: img ? "pass" : "fail", detail: `Running image: ${img}` });
        }

        const warningEvents = run("kubectl get events -n sentinelqa --field-selector type=Warning -o json 2>/dev/null");
        let warnings: any[] = [];
        try {
          warnings = (JSON.parse(warningEvents)?.items || []).filter(
            (ev: any) => ev.involvedObject?.name?.includes("canary") && new Date(ev.lastTimestamp).getTime() > Date.now() - 5 * 60 * 1000
          );
        } catch { /* */ }

        checks.push({
          name: "No Recent Warnings",
          status: warnings.length === 0 ? "pass" : "fail",
          detail: warnings.length === 0 ? "No warning events for canary" : `${warnings.length} warning(s)`,
        });

        const passed = checks.filter((c) => c.status === "pass").length;
        const failed = checks.filter((c) => c.status === "fail").length;

        return NextResponse.json({
          success: true,
          data: { action: "test_canary", checks, summary: { total: checks.length, passed, failed, overall: failed === 0 ? "healthy" : "issues_found" } },
        });
      }

      case "report_issue": {
        // Auto-create GitHub issue + Slack alert for a deployment failure
        const { pod_diagnostics, unhealthy_pods, events: failEvents } = body;

        const issueBody = `## 🚨 Deployment Failure — Canary Unhealthy

**Detected At:** ${new Date().toISOString()}
**Namespace:** sentinelqa
**Cluster:** minikube

### Unhealthy Pods
${(unhealthy_pods || []).map((p: any) => `- **${p.name}** — Status: \`${p.reason || p.status}\`, Restarts: ${p.restarts}`).join("\n")}

### Pod Diagnostics
${Object.entries(pod_diagnostics || {}).map(([pod, logs]) => `
<details>
<summary>📋 ${pod}</summary>

\`\`\`
${(logs as string).substring(0, 2000)}
\`\`\`
</details>
`).join("\n")}

### Recent K8s Events
${(failEvents || []).slice(0, 10).map((ev: any) => `- [${ev.type}] ${ev.message}`).join("\n")}

### Steps Taken
1. ⚠️ Unhealthy canary pods detected via dashboard polling
2. 🔄 Automatic rollback triggered (canary scaled to 0)
3. 🔍 Diagnostics collected from pod logs and \`kubectl describe\`
4. 📝 This issue auto-created by SentinelQA Deployment Guardian

---
*This issue was created automatically by the SentinelQA Deployment Guardian.*`;

        const ghResult = await createGitHubIssue(
          `[SentinelQA] 🚨 Canary Deployment Failure — ${new Date().toISOString().split("T")[0]}`,
          issueBody,
          ["sentinel-qa", "deployment-failure", "bug"]
        );

        // Also send Slack alert
        void sendSlackNotification(
          `🚨 Deployment Failure — GitHub Issue Created`,
          [
            { type: "header", text: { type: "plain_text", text: "🚨 Canary Deployment Failed", emoji: true } },
            { type: "section", text: { type: "mrkdwn", text: `*Unhealthy Pods:* ${(unhealthy_pods || []).map((p: any) => `\`${p.name}\` (${p.reason || "not ready"})`).join(", ")}\n\n*Action Taken:* Auto-rollback executed. Canary scaled to 0.\n${ghResult ? `*GitHub Issue:* <${ghResult.url}|#${ghResult.number}>` : "*GitHub Issue:* Failed to create"}` } },
            { type: "divider" },
            { type: "context", elements: [{ type: "mrkdwn", text: `Detected at <!date^${Math.floor(Date.now() / 1000)}^{date_short} at {time}|${new Date().toISOString()}>` }] },
          ]
        );

        return NextResponse.json({
          success: true,
          data: {
            action: "report_issue",
            github_issue: ghResult,
            slack_sent: true,
          },
        });
      }

      case "status": {
        const output = await runScript(`"${scriptPath}" status`);
        return NextResponse.json({ success: true, data: { action: "status", output: output.substring(0, 3000) } });
      }

      case "teardown": {
        const output = await runScript(`"${scriptPath}" teardown`);
        void sendSlackNotification(`🗑️ All SentinelQA resources torn down.`);
        return NextResponse.json({
          success: true,
          data: { action: "teardown", message: "All resources removed", output: output.substring(0, 3000) },
        });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Deployment action failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

// ─── Helper: Run Script ─────────────────────────────────────────────────────

function runScript(cmd: string): Promise<string> {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) resolve(`ERROR: ${err.message}\n${stderr}\n${stdout}`);
      else resolve(stdout + stderr);
    });
  });
}
