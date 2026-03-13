// ============================================================================
// SentinelQA — Agent Orchestrator
//
// The brain that ties everything together:
//   1. GitHub MCP → reads repo code, detects changes
//   2. AI Agent (simulated for now) → generates test plans from code
//   3. Playwright MCP → executes the test plan in a real browser
//   4. Results → stored in session, ready for dashboard
//
// When the real LangGraph AI agent is ready (Aaskar's part),
// the `generateTestPlan()` method gets replaced with an AI call.
// Everything else stays the same.
// ============================================================================

import { GitHubMCPClient } from "./github-client";
import { PlaywrightMCPClient } from "./playwright-client";
import { TestRunner } from "./test-runner";
import { sessionManager } from "./session-manager";
import { CourierAgent, CourierResult } from "./courier";
import { emitSessionEvent } from "../websocket/server";
import { aiEngine } from "./ai-engine-client";
import { generateTestFiles, buildPRBody } from "./test-writer";
import {
  reportPipelineStart,
  reportTestFailure,
  reportPRCreated,
  reportIssueCreated,
  reportPipelineComplete,
} from "../notion/report-service";
import type { TestPlanInput, TestRunOutput } from "./types";

// ── Orchestrator Config ─────────────────────────────────────────────────────

export interface OrchestratorConfig {
    /** GitHub repo owner */
    owner: string;
    /** GitHub repo name */
    repo: string;
    /** Branch to watch */
    branch: string;
    /** Target URL of the deployed app to test */
    targetUrl: string;
    /** GitHub PAT */
    githubToken?: string;
    /** How to start GitHub MCP: "docker" or "npx" */
    githubMcpMode?: "docker" | "npx";
}

// ── Agent Orchestrator ──────────────────────────────────────────────────────

export class AgentOrchestrator {
    private config: OrchestratorConfig;
    private githubClient: GitHubMCPClient;
    private playwrightClient: PlaywrightMCPClient;

    constructor(config: OrchestratorConfig) {
        this.config = config;
        this.githubClient = new GitHubMCPClient(config.githubToken);
        this.playwrightClient = new PlaywrightMCPClient({ headless: true });
    }

    // ── Full Pipeline ─────────────────────────────────────────────────────────

    /**
     * Run the complete pipeline:
     *   1. Connect to GitHub MCP → read repo code
     *   2. Analyze code → generate test plan
     *   3. Connect to Playwright MCP → execute tests
     *   4. Return results
     */
    async runFullPipeline(): Promise<{
        codeContext: string;
        testPlan: string;
        results: TestRunOutput;
        courier?: CourierResult;
        pr?: { url?: string; number?: number; files: string[] };
    }> {
        console.log("\n🚀 Starting SentinelQA Pipeline...\n");

        const sessionId = `pipeline_${Date.now()}`;
        const ts = () => new Date().toISOString();

        // Emit pipeline started
        emitSessionEvent(sessionId, "pipeline.started", {
          session_id: sessionId, status: "started", timestamp: ts(),
        });

        // Notion: log pipeline start (fire-and-forget — never block the pipeline)
        reportPipelineStart(this.config.repo, sessionId).catch((e) =>
          console.warn(`[Notion] pipeline start log failed: ${(e as Error).message}`)
        );

        // ── Step 1: Read code from GitHub ───────────────────────────────────
        console.log("📦 Step 1: Reading code from GitHub...");
        emitSessionEvent(sessionId, "agent.started", {
          session_id: sessionId, agent_name: "architect", status: "started", message: "Reading repository code", timestamp: ts(),
        });
        const codeContext = await this.readRepoCode();
        console.log(`   ✅ Got code context (${codeContext.length} chars)\n`);

        // ── Step 2: Generate test plan from code ─────────────────────────────
        console.log("🧠 Step 2: AI Agent generating test plan...");
        emitSessionEvent(sessionId, "agent.started", {
          session_id: sessionId, agent_name: "scripter", status: "started", message: "Generating test plan", timestamp: ts(),
        });
        const testPlan = await aiEngine.generateTestPlan(
          codeContext,
          [],
          this.config.targetUrl
        );
        console.log(`   ✅ Test plan generated (${testPlan.split("\n").length} lines)\n`);
        emitSessionEvent(sessionId, "agent.completed", {
          session_id: sessionId, agent_name: "scripter", status: "completed", message: `Generated ${testPlan.split("\n").length} lines`, timestamp: ts(),
        });

        // ── Step 3: Execute tests via Playwright MCP ────────────────────────
        console.log("🎭 Step 3: Executing tests via Playwright MCP...");
        emitSessionEvent(sessionId, "agent.started", {
          session_id: sessionId, agent_name: "playwright", status: "started", message: "Running tests in browser", timestamp: ts(),
        });
        const input: TestPlanInput = {
            test_plan: testPlan,
            target_url: this.config.targetUrl,
            session_id: sessionId,
        };

        await sessionManager.createSession(input);
        await sessionManager.updateStatus(sessionId, "running");
        emitSessionEvent(sessionId, "session.status_changed", {
          session_id: sessionId, status: "running", timestamp: ts(),
        });

        await this.playwrightClient.start();
        const runner = new TestRunner(this.playwrightClient);
        const results = await runner.runTestPlan(input);
        await this.playwrightClient.stop();

        await sessionManager.setOutput(sessionId, results);

        console.log(`   ✅ Tests completed: ${results.passed}/${results.total} passed\n`);

        emitSessionEvent(sessionId, "session.status_changed", {
          session_id: sessionId, status: results.failed > 0 ? "failed" : "completed", timestamp: ts(),
        });

        // ── Step 4: Courier — report failures ───────────────────────────────
        let courierResult: CourierResult | undefined;
        if (results.failed > 0) {
            // Notion: log test failure summary
            const failLogs = results.results
                .filter((r) => r.status === "failed")
                .map((r) => `FAIL  ${r.name}\n      ${r.error ?? "unknown error"}`)
                .join("\n\n");
            reportTestFailure(
                this.config.repo,
                sessionId,
                results.failed,
                results.total,
                failLogs
            ).catch((e) =>
                console.warn(`[Notion] test failure log failed: ${(e as Error).message}`)
            );

            console.log("📨 Step 4: Courier agent reporting failures...");
            const courier = new CourierAgent(this.config.githubToken);
            try {
                const failedTests = results.results
                    .filter((r) => r.status === "failed")
                    .map((r) => `- **${r.name}**: ${r.error ?? "unknown error"}`)
                    .join("\n");

                courierResult = await courier.dispatch(
                    sessionId,
                    this.config.owner,
                    this.config.repo,
                    this.config.branch,
                    `Test failures detected (${results.failed}/${results.total})`,
                    `### Failed Tests\n\n${failedTests}\n\n### Summary\n- Total: ${results.total}\n- Passed: ${results.passed}\n- Failed: ${results.failed}\n- Duration: ${results.duration_ms}ms`,
                    0.5 // Default to issue (no healer fix yet)
                );
                console.log(`   ✅ Courier: Created ${courierResult.type} ${courierResult.url ?? ""}\n`);
                if (courierResult.success) {
                  const eventName = courierResult.type === "pr" ? "courier.pr_created" : "courier.issue_created";
                  emitSessionEvent(sessionId, eventName, {
                    session_id: sessionId, type: courierResult.type, url: courierResult.url, number: courierResult.number, timestamp: ts(),
                  });
                  await sessionManager.setCourierResult(sessionId, {
                    type: courierResult.type, url: courierResult.url, number: courierResult.number,
                  });

                  // Notion: log PR or Issue creation
                  if (courierResult.type === "pr" && courierResult.url) {
                    reportPRCreated(
                      this.config.repo, sessionId,
                      courierResult.url, courierResult.number, 0.5
                    ).catch((e) =>
                      console.warn(`[Notion] PR log failed: ${(e as Error).message}`)
                    );
                  } else if (courierResult.type === "issue" && courierResult.url) {
                    reportIssueCreated(
                      this.config.repo, sessionId,
                      courierResult.url, courierResult.number
                    ).catch((e) =>
                      console.warn(`[Notion] issue log failed: ${(e as Error).message}`)
                    );
                  }
                }
            } catch (courierErr) {
                console.warn(`   ⚠️  Courier failed: ${(courierErr as Error).message}`);
            } finally {
                await courier.stop();
            }
        }

        // ── Step 5: Write test files & open PR ──────────────────────────────
        let prResult: { url?: string; number?: number; files: string[] } | undefined;
        try {
            console.log("📝 Step 5: Writing tests & opening PR...");
            emitSessionEvent(sessionId, "agent.started", {
              session_id: sessionId, agent_name: "test-writer", status: "started",
              message: "Generating Playwright test files", timestamp: ts(),
            });

            const testFiles = generateTestFiles(testPlan, this.config.targetUrl);
            const filePaths = testFiles.map((f) => f.path);
            console.log(`   Generated ${testFiles.length} files: ${filePaths.join(", ")}`);

            // Create branch and push files via GitHub MCP
            const branchName = `sentinelqa/tests-${sessionId.replace("pipeline_", "")}`;
            const prTitle = `[SentinelQA] Auto-generated E2E tests (${results.passed}/${results.total} passed)`;
            const prBody = buildPRBody(sessionId, testPlan, results, testFiles, codeContext.length);

            const ghClient = new GitHubMCPClient(this.config.githubToken);
            try {
                await ghClient.start(this.config.githubMcpMode ?? "npx");

                // Create a new branch
                const branchRes = await ghClient.createBranch(
                    this.config.owner, this.config.repo,
                    branchName, this.config.branch
                );
                if (!branchRes.success) {
                    throw new Error(`Branch creation failed: ${branchRes.error}`);
                }
                console.log(`   ✅ Created branch: ${branchName}`);

                // Push all test files in one commit
                const pushRes = await ghClient.pushFiles(
                    this.config.owner, this.config.repo, branchName,
                    testFiles.map((f) => ({ path: f.path, content: f.content })),
                    `test(e2e): auto-generated by SentinelQA pipeline\n\nSession: ${sessionId}\nTests: ${results.passed}/${results.total} passed`
                );
                if (!pushRes.success) {
                    throw new Error(`File push failed: ${pushRes.error}`);
                }
                console.log(`   ✅ Pushed ${testFiles.length} test files`);

                // Open PR
                const prRes = await ghClient.createPullRequest(
                    this.config.owner, this.config.repo,
                    prTitle, prBody, branchName, this.config.branch
                );
                if (!prRes.success) {
                    throw new Error(`PR creation failed: ${prRes.error}`);
                }

                // Extract PR data
                const prText = prRes.content?.find((c) => c.type === "text")?.text ?? "{}";
                let prUrl: string | undefined;
                let prNum: number | undefined;
                try {
                    const parsed = JSON.parse(prText);
                    prUrl = parsed.html_url ?? parsed.url;
                    prNum = parsed.number;
                } catch {
                    // Try regex fallback
                    const urlMatch = prText.match(/https:\/\/github\.com\/[^\s"]+\/pull\/\d+/);
                    if (urlMatch) prUrl = urlMatch[0];
                    const numMatch = prText.match(/"number":\s*(\d+)/);
                    if (numMatch) prNum = parseInt(numMatch[1], 10);
                }

                prResult = { url: prUrl, number: prNum, files: filePaths };
                console.log(`   ✅ Opened PR #${prNum ?? "?"}: ${prUrl ?? "(url pending)"}\n`);

                emitSessionEvent(sessionId, "courier.pr_created", {
                  session_id: sessionId, type: "pr",
                  url: prUrl, number: prNum, timestamp: ts(),
                });

                // Notion: log auto-test PR creation
                if (prUrl) {
                  reportPRCreated(
                    this.config.repo, sessionId, prUrl, prNum,
                    results.failed === 0 ? 0.95 : 0.7
                  ).catch((e) =>
                    console.warn(`[Notion] test PR log failed: ${(e as Error).message}`)
                  );
                }
            } finally {
                await ghClient.stop();
            }
        } catch (prErr) {
            console.warn(`   ⚠️  Test PR creation failed: ${(prErr as Error).message}`);
            console.warn(`   Tests were generated but could not be pushed to GitHub.`);
        }

        // Emit pipeline.completed after all work (including PR creation) is done
        emitSessionEvent(sessionId, "pipeline.completed", {
          session_id: sessionId,
          status: results.failed > 0 ? "failed" : "completed",
          results_summary: {
            total: results.total, passed: results.passed, failed: results.failed, duration_ms: results.duration_ms,
          },
          pr: prResult ? { url: prResult.url, number: prResult.number } : undefined,
          timestamp: ts(),
        });

        // Notion: log pipeline completion
        reportPipelineComplete(
          this.config.repo,
          sessionId,
          results.passed,
          results.total,
          results.duration_ms,
          prResult?.url
        ).catch((e) =>
          console.warn(`[Notion] pipeline complete log failed: ${(e as Error).message}`)
        );

        return { codeContext, testPlan, results, courier: courierResult, pr: prResult };
    }

    // ── Step 1: Read Code from GitHub ─────────────────────────────────────

    /**
     * Connect to GitHub MCP and read repo code.
     * Returns a summary of the repo structure and key files.
     */
    async readRepoCode(): Promise<string> {
        const { owner, repo, branch } = this.config;

        try {
            await this.githubClient.start(this.config.githubMcpMode ?? "docker");

            // Get repo root contents (file listing)
            const rootContents = await this.githubClient.getFileContents(
                owner, repo, "", branch
            );

            let context = `## Repository: ${owner}/${repo} (branch: ${branch})\n\n`;

            if (rootContents.success && rootContents.content) {
                const rootText = rootContents.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text ?? "")
                    .join("\n");
                context += `### Root Directory:\n${rootText}\n\n`;
            }

            // Try to read common files
            const filesToRead = ["README.md", "package.json", "src/app/page.tsx"];
            for (const file of filesToRead) {
                try {
                    const fileContents = await this.githubClient.getFileContents(
                        owner, repo, file, branch
                    );
                    if (fileContents.success && fileContents.content) {
                        const fileText = fileContents.content
                            .filter((c) => c.type === "text")
                            .map((c) => c.text ?? "")
                            .join("\n");
                        context += `### File: ${file}\n${fileText.substring(0, 500)}\n\n`;
                    }
                } catch {
                    // File might not exist, skip
                }
            }

            // Get recent commits
            const commits = await this.githubClient.listCommits(owner, repo, {
                per_page: 5,
            });
            if (commits.success && commits.content) {
                const commitText = commits.content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text ?? "")
                    .join("\n");
                context += `### Recent Commits:\n${commitText.substring(0, 500)}\n`;
            }

            await this.githubClient.stop();
            return context;
        } catch (err) {
            await this.githubClient.stop();
            console.warn(`  ⚠️  GitHub MCP unavailable: ${(err as Error).message}`);
            return this.getFallbackCodeContext();
        }
    }

    /**
     * Fallback code context when GitHub MCP is not available.
     * Used during development/demos when Docker/PAT isn't set up.
     */
    private getFallbackCodeContext(): string {
        const { owner, repo } = this.config;
        return `## Repository: ${owner}/${repo} (Fallback — GitHub MCP not connected)

### Detected Application Type: Next.js 14 Web App (SentinelQA)
### Key Routes: /, /auth, /dashboard

### Landing Page (/) UI Content:
- Nav: Link "SentinelQA"
- Badge: "Agents Online"
- H1: "Autonomous Quality Engineering"
- Paragraph: "AI agents that write, heal, and observe your tests in real-time. Zero maintenance. Infinite coverage."
- Link: "Start Testing" (goes to /auth)
- Button: "Watch Demo"
- Section H2: "How It Works"
- Section H2: "Built for Autonomous QA"
- Cards: "AI Test Generation", "Self-Healing Tests", "Observability Loop"
- Section H2: "The Agent Squad"
- Agent cards: "Planner", "Writer", "Healer", "Observer"
- Section H2: "Remediation Simulator"
- Button: "Simulate Break"
- Footer: "© 2026 SentinelQA. All rights reserved."

### Auth Page (/auth) UI Content:
- Sign-in form with GitHub, Google, GitLab providers
- Email/password fields
- "Sign In" / "Sign Up" toggle

### Dashboard (/dashboard) UI Content:
- Tabs: Overview, Pipeline, Agents, Tests, Terminal, RCA, PR Tracker
- Pipeline status cards
- Test results table
`;
    }

    // ── Step 2: Generate Test Plan ────────────────────────────────────────

    /**
     * Generate a test plan from code context.
     *
     * 🔮 FUTURE: This gets replaced with an AI call (Claude via LangGraph).
     *    Aaskar's Architect agent will handle this.
     *
     * For now, this generates a reasonable test plan based on the
     * code context and target URL.
     */
    generateTestPlan(codeContext: string): string {
        const { targetUrl } = this.config;

        // Parse what kind of app this is from the context
        const isNextJs = codeContext.toLowerCase().includes("next");
        const hasAuth = codeContext.toLowerCase().includes("auth");
        const hasDashboard = codeContext.toLowerCase().includes("dashboard");

        let plan = `## Auto-Generated Test Plan
### Application: ${targetUrl}
### Generated by: SentinelQA Architect Agent (simulated)
### Based on: Code analysis of repository

---

## Test Suite 1: Landing Page Verification
1. Navigate to ${targetUrl}
2. Take a snapshot of the page
3. Assert the page contains the main heading
`;

        if (hasAuth) {
            plan += `
## Test Suite 2: Authentication Page
1. Navigate to ${targetUrl}/auth
2. Take a snapshot of the page
3. Assert the page contains a login form
`;
        }

        if (hasDashboard) {
            plan += `
## Test Suite 3: Dashboard Access
1. Navigate to ${targetUrl}/dashboard
2. Take a snapshot of the page
`;
        }

        return plan;
    }

    // ── Utility ───────────────────────────────────────────────────────────

    /**
     * Quick health check — can we connect to both MCP servers?
     */
    async healthCheck(): Promise<{
        github: { connected: boolean; tools: string[] };
        playwright: { connected: boolean; tools: string[] };
    }> {
        let githubConnected = false;
        let githubTools: string[] = [];
        let playwrightConnected = false;
        let playwrightTools: string[] = [];

        try {
            await this.githubClient.start(this.config.githubMcpMode ?? "docker");
            githubTools = await this.githubClient.listTools();
            githubConnected = true;
            await this.githubClient.stop();
        } catch {
            githubConnected = false;
        }

        try {
            await this.playwrightClient.start();
            playwrightTools = await this.playwrightClient.listTools();
            playwrightConnected = true;
            await this.playwrightClient.stop();
        } catch {
            playwrightConnected = false;
        }

        return {
            github: { connected: githubConnected, tools: githubTools },
            playwright: { connected: playwrightConnected, tools: playwrightTools },
        };
    }
}
