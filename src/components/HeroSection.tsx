"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Play, ArrowRight, MousePointer2 } from "lucide-react";
import Link from "next/link";

const terminalLogs: { text: string; type: "system" | "agent" | "success" | "error" | "warn" | "info"; delay: number }[] = [
  { text: "SentinelQA v1.0 — pipeline triggered", type: "system", delay: 0 },
  { text: "Push detected: feat/checkout-v2 → main", type: "info", delay: 600 },
  { text: "[ARCHITECT] Connecting to GitHub MCP...", type: "agent", delay: 1200 },
  { text: "[ARCHITECT] Analyzing 847 files across 12 modules", type: "agent", delay: 2000 },
  { text: "[ARCHITECT] ✓ Test plan ready — 14 scenarios", type: "success", delay: 2800 },
  { text: "[SCRIPTER] Launching headless Chromium via Playwright", type: "agent", delay: 3400 },
  { text: "  ✓ test('renders login form') — 0.3s", type: "success", delay: 4000 },
  { text: "  ✓ test('accepts valid credentials') — 1.2s", type: "success", delay: 4500 },
  { text: "  ✓ test('redirects to dashboard') — 0.8s", type: "success", delay: 5000 },
  { text: "  ✗ test('completes checkout flow') — FAILED", type: "error", delay: 5600 },
  { text: '  Error: Locator(".checkout-btn") not found', type: "error", delay: 6000 },
  { text: "[WATCHDOG] Anomaly detected — DOM mutation logged", type: "warn", delay: 6600 },
  { text: "[HEALER] RCA: CSS selector regression in commit a3f9c2b", type: "agent", delay: 7200 },
  { text: "[HEALER] Fix: .checkout-btn → [data-testid='checkout']", type: "success", delay: 7800 },
  { text: "[HEALER] Confidence: 94% ✓", type: "success", delay: 8200 },
  { text: "[COURIER] PR #47 created — auto-fix pushed", type: "agent", delay: 8800 },
  { text: "[COURIER] ✓ Slack notification sent to #dev-alerts", type: "success", delay: 9400 },
  { text: "Pipeline complete — 13/14 passed | 1 healed | MTTR: 28s", type: "system", delay: 10000 },
];

const browserSteps = [
  { step: "idle", at: 0 },
  { step: "navigate", at: 2000 },
  { step: "fill-email", at: 2800 },
  { step: "fill-password", at: 3600 },
  { step: "click-submit", at: 4400 },
  { step: "dashboard", at: 5400 },
  { step: "passed", at: 6400 },
];

const logColorMap: Record<string, string> = {
  system: "text-primary font-semibold",
  agent: "text-cyan-400",
  success: "text-emerald-400",
  error: "text-red-400",
  warn: "text-amber-400",
  info: "text-foreground/70",
};

function TerminalLogs() {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    const timeouts = terminalLogs.map((log, i) =>
      setTimeout(() => setVisibleCount(i + 1), log.delay + 800),
    );

    const resetTimeout = setTimeout(() => {
      setVisibleCount(0);
    }, terminalLogs[terminalLogs.length - 1].delay + 4000);

    return () => {
      timeouts.forEach(clearTimeout);
      clearTimeout(resetTimeout);
    };
  }, [visibleCount === 0]);



  return (
    <div className="glass rounded-xl overflow-hidden neon-border">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive/60" />
          <div className="w-3 h-3 rounded-full bg-accent/60" />
          <div className="w-3 h-3 rounded-full bg-secondary/60" />
        </div>
        <span className="text-xs text-muted-foreground font-mono ml-2">
          sentinel-qa — pipeline
        </span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
          <span className="text-[10px] text-secondary font-medium">Live</span>
        </div>
      </div>
      <div className="p-4 font-mono text-[11px] sm:text-xs leading-relaxed min-h-[280px] max-h-[280px] overflow-y-auto bg-black/20">
        {visibleCount === 0 && (
          <p className="text-muted-foreground/30 text-xs">Awaiting pipeline trigger...</p>
        )}
        {terminalLogs.slice(0, visibleCount).map((log, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.2 }}
            className="flex gap-2 mb-0.5"
          >
            <span className="text-muted-foreground/30 shrink-0 select-none tabular-nums">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className={logColorMap[log.type]}>{log.text}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function BrowserMockup() {
  const [step, setStep] = useState("idle");

  useEffect(() => {
    const timeouts = browserSteps.map((s) =>
      setTimeout(() => setStep(s.step), s.at + 1000),
    );

    const resetTimeout = setTimeout(() => {
      setStep("idle");
    }, 10000);

    return () => {
      timeouts.forEach(clearTimeout);
      clearTimeout(resetTimeout);
    };
  }, []);

  return (
    <div className="glass rounded-xl overflow-hidden neon-border">
      {/* Browser bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/50">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-destructive/60" />
          <div className="w-3 h-3 rounded-full bg-accent/60" />
          <div className="w-3 h-3 rounded-full bg-secondary/60" />
        </div>
        <div className="flex-1 ml-3">
          <div className="bg-muted/50 rounded-md px-3 py-1 text-xs text-muted-foreground font-mono">
            {step === "idle" ? "about:blank" : "https://app.sentinel.qa"}
          </div>
        </div>
      </div>
      {/* Browser content */}
      <div className="p-6 min-h-[280px] flex items-center justify-center relative">
        {step === "idle" && (
          <p className="text-muted-foreground/40 text-sm">
            Waiting for test...
          </p>
        )}
        {step === "navigate" && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-[200px] space-y-3"
          >
            <div className="text-center text-sm font-semibold text-foreground mb-4">
              Log In
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-border/50" />
            <div className="h-8 rounded-md bg-muted/30 border border-border/50" />
            <div className="h-8 rounded-md bg-muted/50 border border-primary/30 text-center text-xs text-muted-foreground flex items-center justify-center">
              Sign In
            </div>
          </motion.div>
        )}
        {step === "fill-email" && (
          <motion.div className="w-full max-w-[200px] space-y-3">
            <div className="text-center text-sm font-semibold text-foreground mb-4">
              Log In
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-primary/60 px-2 flex items-center text-xs text-primary font-mono glow-cyan">
              agent@sentinel.qa
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-border/50" />
            <div className="h-8 rounded-md bg-muted/50 border border-primary/30 text-center text-xs text-muted-foreground flex items-center justify-center">
              Sign In
            </div>
            <MousePointer2 className="absolute bottom-16 right-20 w-4 h-4 text-primary animate-pulse" />
          </motion.div>
        )}
        {step === "fill-password" && (
          <motion.div className="w-full max-w-[200px] space-y-3">
            <div className="text-center text-sm font-semibold text-foreground mb-4">
              Log In
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-border/50 px-2 flex items-center text-xs text-foreground/60 font-mono">
              agent@sentinel.qa
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-primary/60 px-2 flex items-center text-xs text-primary font-mono glow-cyan">
              ••••••••
            </div>
            <div className="h-8 rounded-md bg-muted/50 border border-primary/30 text-center text-xs text-muted-foreground flex items-center justify-center">
              Sign In
            </div>
          </motion.div>
        )}
        {step === "click-submit" && (
          <motion.div className="w-full max-w-[200px] space-y-3">
            <div className="text-center text-sm font-semibold text-foreground mb-4">
              Log In
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-border/50 px-2 flex items-center text-xs text-foreground/60 font-mono">
              agent@sentinel.qa
            </div>
            <div className="h-8 rounded-md bg-muted/30 border border-border/50 px-2 flex items-center text-xs text-foreground/60 font-mono">
              ••••••••
            </div>
            <motion.div
              animate={{ scale: [1, 0.95, 1] }}
              transition={{ duration: 0.2 }}
              className="h-8 rounded-md bg-primary text-primary-foreground text-center text-xs font-semibold flex items-center justify-center glow-cyan"
            >
              Signing In...
            </motion.div>
            <MousePointer2 className="absolute bottom-12 right-24 w-4 h-4 text-primary" />
          </motion.div>
        )}
        {(step === "dashboard" || step === "passed") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="w-full space-y-3"
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-6 h-6 rounded-md bg-primary/20 border border-primary/40" />
              <span className="text-xs font-semibold text-foreground">
                Dashboard
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-12 rounded-md bg-muted/30 border border-border/30"
                />
              ))}
            </div>
            <div className="h-20 rounded-md bg-muted/20 border border-border/30" />
            {step === "passed" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="absolute bottom-4 right-4 bg-secondary/20 border border-secondary/40 rounded-lg px-3 py-1.5 text-xs text-secondary font-mono glow-emerald"
              >
                ✓ Test Passed
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

export default function HeroSection() {
  const { status } = useSession();
  const ctaHref = status === "authenticated" ? "/dashboard" : "/auth";

  return (
    <section className="relative z-10 pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto">
        {/* Tagline */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-6 neon-border">
            <div className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
            <span className="text-xs text-muted-foreground font-medium">
              Agents Online
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight mb-4">
            <span className="text-gradient-cyan">Automated QA</span>
            <br />
            <span className="text-foreground">&amp; Automated Deployment</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-8">
            AI agents that autonomously test, heal, and deploy your code.
            From automated QA to seamless canary deployments — zero maintenance, infinite coverage.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              className="glow-cyan bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2"
              asChild
            >
              <Link href={ctaHref}>
                <Play className="w-4 h-4" /> Start Testing
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border/50 text-foreground hover:bg-muted/50 gap-2"
            >
              Watch Demo <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </motion.div>

        {/* Split view */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.3 }}
          className="grid md:grid-cols-2 gap-4 max-w-5xl mx-auto"
        >
          <TerminalLogs />
          <BrowserMockup />
        </motion.div>
      </div>
    </section>
  );
}
