import { NextRequest, NextResponse } from "next/server";

import { GitHubMCPClient } from "@/lib/mcp/github-client";

export const dynamic = "force-dynamic";

interface PullRequestSummary {
  number: number;
  title: string;
  state: string;
  url: string;
  author: string;
  headRef: string;
  baseRef: string;
  createdAt?: string;
  updatedAt?: string;
}

function extractPullRequests(raw: unknown): PullRequestSummary[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      const pr = item as Record<string, unknown>;
      const user = (pr.user ?? {}) as Record<string, unknown>;
      const head = (pr.head ?? {}) as Record<string, unknown>;
      const base = (pr.base ?? {}) as Record<string, unknown>;

      return {
        number: Number(pr.number ?? 0),
        title: String(pr.title ?? ""),
        state: String(pr.state ?? "open"),
        url: String(pr.html_url ?? pr.url ?? ""),
        author: String(user.login ?? "unknown"),
        headRef: String(head.ref ?? ""),
        baseRef: String(base.ref ?? ""),
        createdAt: pr.created_at ? String(pr.created_at) : undefined,
        updatedAt: pr.updated_at ? String(pr.updated_at) : undefined,
      };
    })
    .filter((pr) => pr.number > 0 && pr.title && pr.url);
}

export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner")?.trim() ?? "";
  const repo = request.nextUrl.searchParams.get("repo")?.trim() ?? "";
  const state =
    (request.nextUrl.searchParams.get("state")?.trim() as
      | "open"
      | "closed"
      | "all"
      | null) ?? "open";
  const query = request.nextUrl.searchParams.get("query")?.trim().toLowerCase() ?? "";
  const githubMcpMode =
    (request.nextUrl.searchParams.get("github_mcp_mode")?.trim() as "docker" | "npx" | null) ??
    "npx";

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing required query params: owner, repo" },
      { status: 400 }
    );
  }

  const client = new GitHubMCPClient();

  try {
    await client.start(githubMcpMode);
    const response = await client.listPullRequests(owner, repo, state);

    if (!response.success) {
      return NextResponse.json(
        { error: response.error ?? "Failed to list pull requests" },
        { status: 502 }
      );
    }

    const textPayload = response.content?.find((c) => c.type === "text")?.text;
    let parsed: unknown = [];
    if (textPayload) {
      try {
        parsed = JSON.parse(textPayload);
      } catch {
        return NextResponse.json(
          { error: "GitHub MCP returned a non-JSON pull request payload" },
          { status: 502 }
        );
      }
    }

    let pullRequests = extractPullRequests(parsed);

    if (query) {
      pullRequests = pullRequests.filter((pr) => {
        const haystack = `${pr.title} ${pr.number} ${pr.author} ${pr.headRef} ${pr.baseRef}`.toLowerCase();
        return haystack.includes(query);
      });
    }

    return NextResponse.json({
      owner,
      repo,
      state,
      count: pullRequests.length,
      pull_requests: pullRequests,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch pull requests";
    return NextResponse.json({ error: message }, { status: 500 });
  } finally {
    await client.stop();
  }
}
