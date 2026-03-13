import { NextRequest, NextResponse } from "next/server";

import { applyPatchAndPush } from "@/lib/courier/apply-patch";
import { CourierAgent } from "@/lib/mcp/courier";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
    const configuredOwner = process.env.SENTINELQA_DEFAULT_OWNER;
    const configuredRepo = process.env.SENTINELQA_DEFAULT_REPO;
    const configuredBranch = process.env.SENTINELQA_DEFAULT_BRANCH ?? "main";
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN ?? process.env.GITHUB_PAT ?? "";

    if (!configuredOwner || !configuredRepo) {
        return NextResponse.json(
            { error: "Courier repository is not configured on the server" },
            { status: 500 }
        );
    }

    // Resolve owner/repo: prefer dispatch_payload (from pipeline request) over env
    const resolveOwnerRepo = (payload?: { owner?: string; repo?: string }) => {
        const o = payload?.owner?.trim();
        const r = payload?.repo?.trim();
        return {
            owner: o && r ? o : configuredOwner,
            repo: o && r ? r : configuredRepo,
        };
    };

    const courier = new CourierAgent();

    try {
        const body = await request.json();
        const {
            dispatch_action,
            dispatch_payload,
        } = body as {
            dispatch_action?: string;
            dispatch_payload?: {
                title?: string;
                body?: string;
                confidence_score?: number;
                session_id?: string;
                head_branch?: string;
                base_branch?: string;
                proposed_patch?: string;
                target_files?: string[];
                owner?: string;
                repo?: string;
            };
        };

        if (!dispatch_action || !dispatch_payload) {
            return NextResponse.json(
                { error: "Missing required fields: dispatch_action, dispatch_payload" },
                { status: 400 }
            );
        }

        const { owner, repo } = resolveOwnerRepo(dispatch_payload);

        if (dispatch_action === "create_issue") {
            const result = await courier.createIssueReport({
                session_id: dispatch_payload.session_id ?? `ai_${Date.now()}`,
                owner,
                repo,
                title: dispatch_payload.title ?? "[SentinelQA] Test failure RCA",
                body: dispatch_payload.body ?? "No issue body provided.",
                labels: ["sentinel-qa", "bug"],
            });
            return NextResponse.json(result, { status: result.success ? 200 : 502 });
        }

        if (dispatch_action === "create_pr") {
            if (!dispatch_payload.head_branch) {
                return NextResponse.json(
                    { error: "Missing required field for create_pr: dispatch_payload.head_branch" },
                    { status: 400 }
                );
            }

            const sessionId = dispatch_payload.session_id ?? `ai_${Date.now()}`;
            const baseBranch = dispatch_payload.base_branch ?? configuredBranch;
            const proposedPatch = dispatch_payload.proposed_patch?.trim();

            // When Healer provides a patch: clone target repo, apply, push, then create PR
            if (proposedPatch && githubToken) {
                const applyResult = applyPatchAndPush({
                    owner,
                    repo,
                    baseBranch,
                    headBranch: dispatch_payload.head_branch,
                    proposedPatch,
                    sessionId,
                    githubToken,
                });

                if (!applyResult.success) {
                    // Fall back to Issue when patch fails to apply
                    const result = await courier.createIssueReport({
                        session_id: sessionId,
                        owner,
                        repo,
                        title: `[Failed to Apply Patch] ${dispatch_payload.title ?? "[SentinelQA] Test failure RCA"}`,
                        body: `**Note**: The Healer generated a patch but it failed to apply.\n\`\`\`\n${applyResult.error ?? "Unknown error"}\n\`\`\`\n\n${dispatch_payload.body ?? ""}`,
                        labels: ["sentinel-qa", "bug"],
                    });
                    return NextResponse.json(result, { status: result.success ? 200 : 502 });
                }
            }

            const result = await courier.createFixPR({
                session_id: sessionId,
                owner,
                repo,
                base_branch: baseBranch,
                head_branch: dispatch_payload.head_branch,
                title: dispatch_payload.title ?? "[SentinelQA] Automated fix PR",
                body: dispatch_payload.body ?? "No PR body provided.",
                confidence_score: dispatch_payload.confidence_score ?? 1.0,
            });
            return NextResponse.json(result, { status: result.success ? 200 : 502 });
        }

        return NextResponse.json(
            { error: `Unsupported dispatch_action '${dispatch_action}'` },
            { status: 400 }
        );
    } catch (err) {
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Internal server error" },
            { status: 500 }
        );
    } finally {
        await courier.stop();
    }
}
