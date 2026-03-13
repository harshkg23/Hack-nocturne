"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Rocket,
  ArrowLeft,
  RotateCcw,
  FastForward,
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Server,
  Cpu,
  MemoryStick,
  Gauge,
  RefreshCcw,
  Settings2,
  Terminal,
  GitBranch,
  GitCommit,
  Container,
  Layers,
  ScrollText,
  Trash2,
  ChevronDown,
  HeartPulse,
  ShieldAlert,
  Stethoscope,
  ExternalLink,
  BarChart3,
  MessageSquare,
  Github,
  Eye,
  EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PodState {
  name: string;
  track: string;
  status: string;
  ready: boolean;
  restarts: number;
  image: string;
  startedAt: string;
  reason: string;
}

interface DeploymentState {
  name: string;
  track: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
  updatedReplicas: number;
  image: string;
}

interface K8sEvent {
  timestamp: string;
  type: string;
  reason: string;
  message: string;
  count: number;
}

interface CommitInfo {
  hash: string;
  message: string;
  time: string;
  author: string;
  fullHash: string;
}

interface ApiData {
  config: any;
  latest_commit: string;
  commit_hash: string;
  overall_status: string;
  canary_traffic_percent: number;
  pods: PodState[];
  deployments: DeploymentState[];
  metrics: Record<string, { cpu: string; memory: string }>;
  events: K8sEvent[];
  unhealthy_canary: PodState[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
  } catch { return "—"; }
}

const statusColors: Record<string, string> = {
  Running: "text-emerald-400", Pending: "text-amber-400", Failed: "text-red-400",
  ImagePullBackOff: "text-red-400", CrashLoopBackOff: "text-red-400", ContainerCreating: "text-amber-400",
};
const statusDots: Record<string, string> = {
  Running: "bg-emerald-400", Pending: "bg-amber-400", Failed: "bg-red-400",
  ImagePullBackOff: "bg-red-400", CrashLoopBackOff: "bg-red-400", ContainerCreating: "bg-amber-400",
};
const eventIcons: Record<string, React.ReactNode> = {
  info: <Activity className="w-3 h-3 text-blue-400" />,
  warning: <AlertTriangle className="w-3 h-3 text-amber-400" />,
  error: <XCircle className="w-3 h-3 text-red-400" />,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeploymentPage() {
  const [data, setData] = useState<ApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionOutput, setActionOutput] = useState<string | null>(null);

  // Commit picker
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<CommitInfo | null>(null);
  const [commitPickerOpen, setCommitPickerOpen] = useState(false);

  // Pod logs
  const [showLogsForPod, setShowLogsForPod] = useState<string | null>(null);
  const [podLogs, setPodLogs] = useState<Record<string, string>>({});
  const [logsLoading, setLogsLoading] = useState<string | null>(null);

  // Health alert
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnostics, setDiagnostics] = useState<Record<string, string> | null>(null);
  const [autoRolledBack, setAutoRolledBack] = useState(false);

  // Health check / test canary
  const [testingCanary, setTestingCanary] = useState(false);
  const [healthChecks, setHealthChecks] = useState<{
    checks: { name: string; status: "pass" | "fail"; detail: string }[];
    summary: { total: number; passed: number; failed: number; overall: string };
  } | null>(null);

  // GitHub / Slack reporting
  const [reportingIssue, setReportingIssue] = useState(false);
  const [githubIssue, setGithubIssue] = useState<{ number: number; url: string } | null>(null);

  // Active tab for bottom panels
  const [activeTab, setActiveTab] = useState<"pods" | "events" | "grafana" | "prometheus">("pods");

  // ── Data Fetching ─────────────────────────────────────────────────────────

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch("/api/deployment");
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (e) { console.error("Failed to fetch:", e); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  const fetchCommits = useCallback(async () => {
    try {
      const res = await fetch("/api/deployment?commits=true");
      const json = await res.json();
      if (json.success) setCommits(json.commits);
    } catch (e) { console.error("Failed to fetch commits:", e); }
  }, []);

  useEffect(() => {
    fetchState();
    fetchCommits();
    const interval = setInterval(fetchState, 10000);
    return () => clearInterval(interval);
  }, [fetchState, fetchCommits]);

  // ── Auto-detect unhealthy canary & rollback ───────────────────────────────
  const unhealthyCountRef = useRef(0);

  useEffect(() => {
    if (!data) return;
    if (data.unhealthy_canary && data.unhealthy_canary.length > 0) {
      unhealthyCountRef.current += 1;
      if (unhealthyCountRef.current >= 3 && !autoRolledBack) {
        setAutoRolledBack(true);
        performAction("rollback").then(() => {
          handleDiagnose().then(() => {
            handleReportIssue();
          });
        });
      }
    } else {
      unhealthyCountRef.current = 0;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // ── Pod logs ──────────────────────────────────────────────────────────────
  const fetchPodLogs = useCallback(async (podName: string) => {
    setLogsLoading(podName);
    try {
      const res = await fetch(`/api/deployment?pod=${encodeURIComponent(podName)}`);
      const json = await res.json();
      if (json.success) setPodLogs((prev) => ({ ...prev, [podName]: json.logs }));
    } catch (e) { setPodLogs((prev) => ({ ...prev, [podName]: `Error: ${e}` })); }
    finally { setLogsLoading(null); }
  }, []);

  const handleRefresh = useCallback(() => { setRefreshing(true); fetchState(); }, [fetchState]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const performAction = async (action: string, extra?: Record<string, string>) => {
    setActionLoading(action);
    setActionOutput(null);
    try {
      const res = await fetch("/api/deployment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json();
      if (json.success && json.data.output) setActionOutput(json.data.output);
      await fetchState();
    } catch (e) { console.error(`Action ${action} failed:`, e); setActionOutput(`Error: ${e}`); }
    finally { setActionLoading(null); }
  };

  const handleDeploy = () => {
    setAutoRolledBack(false);
    setDiagnostics(null);
    setGithubIssue(null);
    setHealthChecks(null);
    const extra = selectedCommit ? { commit_hash: selectedCommit.hash } : {};
    performAction("deploy", extra);
  };

  const handleTestCanary = async () => {
    setTestingCanary(true);
    setHealthChecks(null);
    try {
      const res = await fetch("/api/deployment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_canary" }),
      });
      const json = await res.json();
      if (json.success && json.data.checks) {
        setHealthChecks({ checks: json.data.checks, summary: json.data.summary });
      }
    } catch (e) { console.error("Test Canary failed:", e); }
    finally { setTestingCanary(false); }
  };

  const handleDiagnose = async () => {
    setDiagnosing(true);
    try {
      const res = await fetch("/api/deployment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "diagnose" }),
      });
      const json = await res.json();
      if (json.success) setDiagnostics(json.data.diagnostics);
    } catch (e) { console.error("Diagnose failed:", e); }
    finally { setDiagnosing(false); }
  };

  const handleReportIssue = async () => {
    setReportingIssue(true);
    try {
      const res = await fetch("/api/deployment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "report_issue",
          pod_diagnostics: diagnostics || {},
          unhealthy_pods: data?.unhealthy_canary || [],
          events: data?.events?.filter((e) => e.type === "warning") || [],
        }),
      });
      const json = await res.json();
      if (json.success && json.data.github_issue) {
        setGithubIssue(json.data.github_issue);
      }
    } catch (e) { console.error("Report issue failed:", e); }
    finally { setReportingIssue(false); }
  };

  // ── Loading state ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center text-red-400">
        Failed to connect to cluster
      </div>
    );
  }

  const stableDep = data.deployments.find((d) => d.track === "stable");
  const canaryDep = data.deployments.find((d) => d.track === "canary");
  const isCanaryActive = canaryDep && canaryDep.replicas > 0;
  const hasUnhealthy = data.unhealthy_canary && data.unhealthy_canary.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 glass-strong border-b border-border/40">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /><span className="text-sm">Dashboard</span>
            </Link>
            <div className="w-px h-6 bg-border/60" />
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h1 className="text-sm font-bold">Canary Deployment</h1>
                <p className="text-xs text-muted-foreground">minikube · sentinelqa</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
              hasUnhealthy ? "bg-red-500/10 border-red-500/30 text-red-400"
              : isCanaryActive ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
              : "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            }`}>
              <span className={`w-2 h-2 rounded-full animate-pulse ${hasUnhealthy ? "bg-red-400" : isCanaryActive ? "bg-cyan-400" : "bg-emerald-400"}`} />
              {hasUnhealthy ? "CANARY UNHEALTHY" : data.overall_status.replace(/_/g, " ").toUpperCase()}
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="border-border/60">
              <RefreshCcw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* ── HEALTH ALERT BANNER ─────────────────────────────────────── */}
        {hasUnhealthy && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border-2 border-red-500/40 bg-red-500/5 p-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-red-400 mb-1">⚠️ Canary Deployment Issue Detected</h3>
                <p className="text-xs text-red-300/80 mb-2">
                  {data.unhealthy_canary.length} canary pod(s) unhealthy: {data.unhealthy_canary.map((p) => `${p.name} (${p.reason || "not ready"})`).join(", ")}
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  {autoRolledBack ? "🔄 Auto-rollback triggered. Canary scaled to 0." : "If this persists 30s, auto-rollback will engage."}
                </p>
                <div className="flex items-center gap-3 flex-wrap">
                  <Button onClick={() => performAction("rollback")} disabled={actionLoading === "rollback"} size="sm" className="bg-red-600 hover:bg-red-500 text-white">
                    {actionLoading === "rollback" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                    Rollback Now
                  </Button>
                  <Button onClick={handleDiagnose} disabled={diagnosing} variant="outline" size="sm" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                    {diagnosing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5 mr-1.5" />}
                    Diagnose
                  </Button>
                  <Button onClick={handleReportIssue} disabled={reportingIssue} variant="outline" size="sm" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                    {reportingIssue ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Github className="w-3.5 h-3.5 mr-1.5" />}
                    Report to GitHub + Slack
                  </Button>
                </div>
                {githubIssue && (
                  <div className="mt-3 flex items-center gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Issue #{githubIssue.number} created —</span>
                    <a href={githubIssue.url} target="_blank" rel="noopener" className="text-purple-400 underline flex items-center gap-1">
                      View on GitHub <ExternalLink className="w-3 h-3" />
                    </a>
                    <span className="text-muted-foreground ml-2">+ Slack notified</span>
                  </div>
                )}
              </div>
            </div>

            {diagnostics && (
              <div className="mt-4 pt-4 border-t border-red-500/20">
                <h4 className="text-xs font-bold text-red-400 mb-2 flex items-center gap-1.5">
                  <Stethoscope className="w-3.5 h-3.5" /> Failure Diagnostics
                </h4>
                {Object.entries(diagnostics).map(([pod, output]) => (
                  <div key={pod} className="mb-3">
                    <p className="text-xs font-mono text-red-300 mb-1">{pod}</p>
                    <pre className="text-[11px] font-mono text-red-200/70 bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">{output}</pre>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ── COMMIT PICKER + DEPLOY ──────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl p-5 neon-border relative z-30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center">
                <GitCommit className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold">Select Commit to Deploy</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Choose a specific commit or deploy from HEAD</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Container className="w-4 h-4" /> Strategy: <span className="text-cyan-400 font-medium">Canary</span>
            </div>
          </div>

          {/* Commit Selector */}
          <div className="mb-4">
            <button onClick={() => setCommitPickerOpen(!commitPickerOpen)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-zinc-900/80 border border-border/40 hover:border-purple-500/40 transition-colors text-left">
              <div className="flex items-center gap-3">
                <GitBranch className="w-4 h-4 text-purple-400 shrink-0" />
                {selectedCommit ? (
                  <div>
                    <span className="text-xs font-mono text-purple-400 font-medium">{selectedCommit.hash}</span>
                    <span className="text-xs text-foreground ml-2">{selectedCommit.message}</span>
                    <span className="text-[10px] text-muted-foreground ml-2">{selectedCommit.time} by {selectedCommit.author}</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">HEAD (latest) — {data.latest_commit}</span>
                )}
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${commitPickerOpen ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {commitPickerOpen && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                  className="mt-1 rounded-xl bg-zinc-900 border border-border/60 shadow-xl overflow-hidden">
                  <div className="max-h-[300px] overflow-y-auto">
                    <button onClick={() => { setSelectedCommit(null); setCommitPickerOpen(false); }}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 hover:bg-zinc-800 text-left border-b border-border/20 ${!selectedCommit ? "bg-purple-500/10" : ""}`}>
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-xs font-mono text-emerald-400 font-medium">HEAD</span>
                      <span className="text-xs text-muted-foreground">Deploy from current branch tip</span>
                    </button>
                    {commits.map((c) => (
                      <button key={c.fullHash} onClick={() => { setSelectedCommit(c); setCommitPickerOpen(false); }}
                        className={`w-full flex items-start gap-3 px-4 py-2.5 hover:bg-zinc-800 text-left border-b border-border/10 ${selectedCommit?.hash === c.hash ? "bg-purple-500/10" : ""}`}>
                        <div className="w-2 h-2 rounded-full bg-zinc-500 mt-1 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-purple-400 font-medium">{c.hash}</span>
                            <span className="text-[10px] text-muted-foreground">{c.time}</span>
                          </div>
                          <p className="text-xs text-foreground truncate mt-0.5">{c.message}</p>
                          <p className="text-[10px] text-muted-foreground">{c.author}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {!isCanaryActive && (
            <Button onClick={handleDeploy} disabled={actionLoading === "deploy"}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold h-11">
              {actionLoading === "deploy" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Rocket className="w-4 h-4 mr-2" />}
              Deploy Canary{selectedCommit ? ` from ${selectedCommit.hash}` : " from HEAD"}
            </Button>
          )}
        </motion.section>

        {/* ── CANARY TRAFFIC BAR ──────────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="glass rounded-2xl p-6 neon-border">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Gauge className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-sm font-bold">Canary Traffic Split</h3>
                <p className="text-xs text-muted-foreground">
                  Stable: {stableDep?.replicas || 0} replicas | Canary: {canaryDep?.replicas || 0} replicas
                </p>
              </div>
            </div>
            <span className="text-3xl font-black text-gradient-cyan tabular-nums">{data.canary_traffic_percent}%</span>
          </div>

          <div className="relative h-4 rounded-full bg-zinc-800 overflow-hidden mb-4">
            <motion.div className="absolute inset-y-0 left-0 rounded-full"
              style={{ background: hasUnhealthy ? "linear-gradient(90deg, #ef4444, #f97316)" : "linear-gradient(90deg, #06b6d4, #3b82f6, #8b5cf6)" }}
              initial={{ width: "0%" }} animate={{ width: `${data.canary_traffic_percent}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }} />
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
            <span>0% (stable only)</span><span>50%</span><span>100% (full canary)</span>
          </div>

          {isCanaryActive && (
            <div className="flex items-center gap-3 pt-4 border-t border-border/30 flex-wrap">
              <Button onClick={() => performAction("promote")} disabled={actionLoading === "promote" || !!hasUnhealthy}
                className="bg-emerald-600 hover:bg-emerald-500 text-white" size="sm">
                {actionLoading === "promote" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <FastForward className="w-3.5 h-3.5 mr-1.5" />}
                Promote to 100%
              </Button>
              <Button onClick={() => performAction("rollback")} disabled={actionLoading === "rollback"} variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                {actionLoading === "rollback" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1.5" />}
                Rollback
              </Button>
              <Button onClick={handleDiagnose} disabled={diagnosing} variant="outline" size="sm" className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10">
                {diagnosing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Stethoscope className="w-3.5 h-3.5 mr-1.5" />}
                Diagnose
              </Button>
              <Button onClick={handleTestCanary} disabled={testingCanary} variant="outline" size="sm" className="border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10">
                {testingCanary ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <HeartPulse className="w-3.5 h-3.5 mr-1.5" />}
                Test Canary
              </Button>
              <Button onClick={handleReportIssue} disabled={reportingIssue} variant="outline" size="sm" className="border-purple-500/30 text-purple-400 hover:bg-purple-500/10">
                {reportingIssue ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Github className="w-3.5 h-3.5 mr-1.5" />}
                Report Issue
              </Button>
              <Button onClick={() => performAction("teardown")} disabled={actionLoading === "teardown"} variant="outline" size="sm" className="border-red-600/30 text-red-500 hover:bg-red-600/10 ml-auto">
                {actionLoading === "teardown" ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1.5" />}
                Teardown
              </Button>
            </div>
          )}
        </motion.section>

        {/* ── GitH Issue Confirmation (standalone) ───────────────────── */}
        {githubIssue && !hasUnhealthy && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl p-4 border border-emerald-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <div>
                  <p className="text-sm font-bold text-emerald-400">GitHub Issue #{githubIssue.number} Created + Slack Notified</p>
                  <a href={githubIssue.url} target="_blank" rel="noopener" className="text-xs text-purple-400 underline flex items-center gap-1 mt-0.5">
                    {githubIssue.url} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setGithubIssue(null)} className="text-xs text-muted-foreground">Dismiss</Button>
            </div>
          </motion.div>
        )}

        {/* ── Health Check Results ─────────────────────────────────────── */}
        {healthChecks && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className={`glass rounded-2xl p-5 border-2 ${healthChecks.summary.overall === "healthy" ? "border-emerald-500/30" : "border-amber-500/30"}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <HeartPulse className={`w-4 h-4 ${healthChecks.summary.overall === "healthy" ? "text-emerald-400" : "text-amber-400"}`} />
                Deployment Health Check — <span className={healthChecks.summary.overall === "healthy" ? "text-emerald-400" : "text-amber-400"}>
                  {healthChecks.summary.passed}/{healthChecks.summary.total} passed
                </span>
              </h3>
              <Button variant="ghost" size="sm" onClick={() => setHealthChecks(null)} className="text-xs text-muted-foreground">Dismiss</Button>
            </div>
            <div className="space-y-2">
              {healthChecks.checks.map((check, i) => (
                <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-zinc-900/50">
                  {check.status === "pass" ? <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">{check.name}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* ── Script Output ───────────────────────────────────────────── */}
        {actionOutput && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2"><Terminal className="w-4 h-4 text-amber-400" /> Script Output</h3>
              <Button variant="ghost" size="sm" onClick={() => setActionOutput(null)} className="text-xs text-muted-foreground">Dismiss</Button>
            </div>
            <pre className="text-xs font-mono text-emerald-300/90 bg-zinc-950 rounded-lg p-4 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">{actionOutput}</pre>
          </motion.section>
        )}

        {/* Diagnostics Output (standalone) */}
        {diagnostics && !hasUnhealthy && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5 border border-amber-500/30">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2 text-amber-400"><Stethoscope className="w-4 h-4" /> Pod Diagnostics</h3>
              <Button variant="ghost" size="sm" onClick={() => setDiagnostics(null)} className="text-xs text-muted-foreground">Dismiss</Button>
            </div>
            {Object.entries(diagnostics).map(([pod, output]) => (
              <div key={pod} className="mb-3">
                <p className="text-xs font-mono text-amber-300 mb-1">{pod}</p>
                <pre className="text-[11px] font-mono text-amber-200/70 bg-zinc-950 rounded-lg p-3 overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">{output}</pre>
              </div>
            ))}
          </motion.section>
        )}

        {/* ── TAB BAR: Pods | Events | Grafana | Prometheus ───────────── */}
        <div className="flex items-center gap-1 border-b border-border/30 pb-0">
          {([
            { key: "pods", icon: <Server className="w-3.5 h-3.5" />, label: `Pods (${data.pods.length})` },
            { key: "events", icon: <Activity className="w-3.5 h-3.5" />, label: `Events (${data.events.length})` },
            { key: "grafana", icon: <BarChart3 className="w-3.5 h-3.5" />, label: "Grafana" },
            { key: "prometheus", icon: <Gauge className="w-3.5 h-3.5" />, label: "Prometheus" },
          ] as { key: "pods" | "events" | "grafana" | "prometheus"; icon: React.ReactNode; label: string }[]).map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? "border-cyan-400 text-cyan-400"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ── TAB CONTENT ─────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {activeTab === "pods" && (
            <motion.div key="pods" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {data.pods.length === 0 && (
                  <div className="lg:col-span-2 glass rounded-xl p-8 text-center text-muted-foreground text-sm">
                    No pods found. Click &quot;Deploy Canary&quot; above.
                  </div>
                )}
                {data.pods.map((pod) => {
                  const podMetrics = data.metrics[pod.name];
                  const isUnhealthy = data.unhealthy_canary?.some((u) => u.name === pod.name);
                  return (
                    <motion.div key={pod.name} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                      className={`glass rounded-xl p-5 transition-all ${isUnhealthy ? "border-2 border-red-500/40 bg-red-500/5" : "neon-border-hover"}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${isUnhealthy ? "bg-red-500/15 border-red-500/30 text-red-400" : "bg-card/60 border-border/40 text-muted-foreground"}`}>
                            {isUnhealthy ? <HeartPulse className="w-4 h-4" /> : <Server className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold font-mono">{pod.name}</p>
                            <p className="text-[11px] text-muted-foreground">{pod.image}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            pod.track === "canary" ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400"
                            : pod.track === "stable" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                            : "bg-zinc-500/10 border-zinc-500/30 text-zinc-400"
                          }`}>{pod.track}</span>
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${statusDots[pod.status] || statusDots[pod.reason] || "bg-zinc-400"}`} />
                            <span className={`text-xs font-medium ${statusColors[pod.status] || statusColors[pod.reason] || "text-zinc-400"}`}>
                              {pod.reason || pod.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-xs">
                        <span className={pod.restarts > 0 ? "text-amber-400" : "text-muted-foreground"}>Restarts: {pod.restarts}</span>
                        {podMetrics && (
                          <>
                            <span className="text-muted-foreground">|</span>
                            <span className="flex items-center gap-1 text-muted-foreground"><Cpu className="w-3 h-3" /> <span className="text-foreground font-medium">{podMetrics.cpu}</span></span>
                            <span className="flex items-center gap-1 text-muted-foreground"><MemoryStick className="w-3 h-3" /> <span className="text-foreground font-medium">{podMetrics.memory}</span></span>
                          </>
                        )}
                        {!podMetrics && <span className="text-muted-foreground italic">metrics loading...</span>}
                      </div>

                      <div className="mt-3 pt-3 border-t border-border/20 flex items-center gap-3">
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            const isOpen = showLogsForPod === pod.name;
                            setShowLogsForPod(isOpen ? null : pod.name);
                            if (!isOpen && !podLogs[pod.name]) fetchPodLogs(pod.name);
                          }}>
                          {showLogsForPod === pod.name ? <EyeOff className="w-3 h-3 mr-1.5" /> : <Eye className="w-3 h-3 mr-1.5" />}
                          {showLogsForPod === pod.name ? "Hide Logs" : "View Logs"}
                        </Button>
                        {showLogsForPod === pod.name && (
                          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => fetchPodLogs(pod.name)} disabled={logsLoading === pod.name}>
                            <RefreshCcw className={`w-3 h-3 mr-1.5 ${logsLoading === pod.name ? "animate-spin" : ""}`} /> Refresh
                          </Button>
                        )}
                      </div>

                      {showLogsForPod === pod.name && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3">
                          <pre className="text-[11px] font-mono text-emerald-300/80 bg-zinc-950 rounded-lg p-4 overflow-x-auto max-h-[300px] overflow-y-auto whitespace-pre-wrap">
                            {logsLoading === pod.name ? "Loading logs..." : podLogs[pod.name] || "(no logs yet)"}
                          </pre>
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {activeTab === "events" && (
            <motion.div key="events" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="glass rounded-xl neon-border overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto p-4 space-y-3">
                  {data.events.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No events yet</p>}
                  {[...data.events].reverse().map((event, i) => (
                    <div key={`${event.timestamp}-${i}`} className="flex gap-3">
                      <div className="mt-1 shrink-0">{eventIcons[event.type] || eventIcons.info}</div>
                      <div className="min-w-0">
                        <p className="text-xs text-foreground/90 leading-relaxed">
                          <span className="font-medium text-muted-foreground">[{event.reason}]</span> {event.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {formatTime(event.timestamp)}
                          {event.count > 1 && <span className="ml-2 text-amber-400/70">×{event.count}</span>}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "grafana" && (
            <motion.div key="grafana" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="glass rounded-xl neon-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-orange-400" />
                    <span className="text-sm font-bold">Grafana Dashboard</span>
                    <span className="text-xs text-muted-foreground">(admin/admin)</span>
                  </div>
                  <a href="http://localhost:30020/d/e82577e5-e63b-4b77-b8a2-c30e00669110/sentinelqa-deployment-monitor" target="_blank" rel="noopener"
                    className="text-xs text-cyan-400 flex items-center gap-1 hover:underline">
                    Open in new tab <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <iframe src="http://localhost:30020/d/e82577e5-e63b-4b77-b8a2-c30e00669110/sentinelqa-deployment-monitor?orgId=1&kiosk=tv" className="w-full h-[600px] border-0 bg-zinc-950" title="Grafana" />
              </div>
            </motion.div>
          )}

          {activeTab === "prometheus" && (
            <motion.div key="prometheus" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="glass rounded-xl neon-border overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-red-400" />
                    <span className="text-sm font-bold">Prometheus</span>
                  </div>
                  <a href="http://localhost:30090" target="_blank" rel="noopener"
                    className="text-xs text-cyan-400 flex items-center gap-1 hover:underline">
                    Open in new tab <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <iframe src="http://localhost:30090" className="w-full h-[600px] border-0 bg-zinc-950" title="Prometheus" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Deployments Overview ────────────────────────────────────── */}
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="glass rounded-2xl p-6">
          <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><Layers className="w-4 h-4 text-zinc-400" /> Kubernetes Deployments</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.deployments.map((dep) => (
              <div key={dep.name} className={`rounded-xl p-4 border ${
                dep.track === "canary" ? "border-cyan-500/30 bg-cyan-500/5"
                : dep.track === "stable" ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-zinc-500/30 bg-zinc-500/5"
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold font-mono">{dep.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                    dep.track === "canary" ? "border-cyan-500/30 text-cyan-400"
                    : dep.track === "stable" ? "border-emerald-500/30 text-emerald-400"
                    : "border-zinc-500/30 text-zinc-400"
                  }`}>{dep.track}</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Image</span>
                    <span className="font-mono text-foreground truncate ml-2 max-w-[200px]">{dep.image}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Replicas</span>
                    <span className="font-mono text-foreground">{dep.readyReplicas}/{dep.replicas} ready</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Available</span>
                    <span className={`font-mono ${dep.availableReplicas >= dep.replicas ? "text-emerald-400" : "text-amber-400"}`}>
                      {dep.availableReplicas}/{dep.replicas}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1 mt-3">
                  {Array.from({ length: dep.replicas }).map((_, i) => (
                    <div key={i} className={`w-3 h-3 rounded-sm ${i < dep.readyReplicas ? "bg-emerald-500" : "bg-zinc-700"}`} />
                  ))}
                  {dep.replicas === 0 && <span className="text-xs text-muted-foreground italic">No replicas</span>}
                </div>
              </div>
            ))}
          </div>
        </motion.section>

        {/* ── Config ─────────────────────────────────────────────────── */}
        {data.config && (
          <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="glass rounded-2xl p-6">
            <h3 className="text-sm font-bold flex items-center gap-2 mb-4"><Settings2 className="w-4 h-4 text-zinc-400" /> sentinelqa.config.json</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div className="rounded-lg bg-card/30 p-3 border border-border/30">
                <p className="text-muted-foreground mb-1">Strategy</p>
                <p className="font-bold text-cyan-400">{data.config.deployment?.strategy || "canary"}</p>
              </div>
              <div className="rounded-lg bg-card/30 p-3 border border-border/30">
                <p className="text-muted-foreground mb-1">Environment</p>
                <p className="font-bold text-foreground">{data.config.deployment?.environment || "minikube"}</p>
              </div>
              <div className="rounded-lg bg-card/30 p-3 border border-border/30">
                <p className="text-muted-foreground mb-1">Prometheus</p>
                <p className="font-bold">{data.config.monitoring?.prometheus?.enabled ? <span className="text-emerald-400">● Enabled</span> : <span className="text-zinc-400">○ Disabled</span>}</p>
              </div>
              <div className="rounded-lg bg-card/30 p-3 border border-border/30">
                <p className="text-muted-foreground mb-1">Grafana</p>
                <p className="font-bold">{data.config.monitoring?.grafana?.enabled ? <span className="text-emerald-400">● Enabled</span> : <span className="text-zinc-400">○ Disabled</span>}</p>
              </div>
            </div>
          </motion.section>
        )}
      </main>
    </div>
  );
}
