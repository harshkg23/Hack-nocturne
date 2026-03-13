"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { AlertTriangle, HeartPulse, Check, MessageSquare } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const healCode = [
  "// Healer Agent activated",
  "const oldSelector = '.btn-primary';",
  "const newSelector = await findBestMatch('.btn-primary');",
  "// Found: button[data-testid='submit']",
  "await page.click(button[data-testid='submit']);",
  "// ✓ Selector healed successfully",
];

type Phase = "idle" | "broken" | "healing" | "healed";

export default function RemediationSimulator() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [healLine, setHealLine] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const simulateBreak = () => {
    setPhase("broken");
    setTimeout(() => {
      setPhase("healing");
      setHealLine(0);
    }, 2000);
  };

  useEffect(() => {
    if (phase === "healing") {
      if (healLine < healCode.length) {
        timerRef.current = setTimeout(() => setHealLine((l) => l + 1), 600);
      } else {
        setTimeout(() => {
          setPhase("healed");
          toast({
            title: "🎉 Test Healed",
            description: "Healer Agent fixed the broken selector in 1.8s",
          });
        }, 800);
      }
    }
    if (phase === "healed") {
      setTimeout(() => setPhase("idle"), 5000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [phase, healLine]);

  const overlayColor =
    phase === "broken"
      ? "bg-accent/5"
      : phase === "healing"
        ? "bg-accent/5"
        : phase === "healed"
          ? "bg-secondary/5"
          : "";

  return (
    <section className="relative z-10 py-24 px-6">
      <div
        className={`absolute inset-0 transition-colors duration-1000 ${overlayColor}`}
      />
      <div className="max-w-4xl mx-auto relative">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            Remediation <span className="text-gradient-cyan">Simulator</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            See how the Healer Agent fixes broken tests in real-time.
          </p>
        </motion.div>

        <div className="glass rounded-2xl neon-border overflow-hidden max-w-2xl mx-auto">
          {/* Terminal header */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-destructive/60" />
                <div className="w-3 h-3 rounded-full bg-accent/60" />
                <div className="w-3 h-3 rounded-full bg-secondary/60" />
              </div>
              <span className="text-xs text-muted-foreground font-mono ml-2">
                healer-agent.ts
              </span>
            </div>
            <div className="flex items-center gap-2">
              {phase === "broken" && (
                <span className="text-xs text-accent font-mono flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> BROKEN
                </span>
              )}
              {phase === "healing" && (
                <span className="text-xs text-accent font-mono flex items-center gap-1 animate-pulse">
                  <HeartPulse className="w-3 h-3" /> HEALING
                </span>
              )}
              {phase === "healed" && (
                <span className="text-xs text-secondary font-mono flex items-center gap-1">
                  <Check className="w-3 h-3" /> HEALED
                </span>
              )}
            </div>
          </div>

          {/* Terminal body */}
          <div className="p-5 font-mono text-xs sm:text-sm min-h-[220px]">
            <AnimatePresence mode="wait">
              {phase === "idle" && (
                <motion.div
                  key="idle"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center h-[180px] gap-4"
                >
                  <p className="text-muted-foreground text-center">
                    Click below to simulate a broken test selector.
                  </p>
                  <Button
                    onClick={simulateBreak}
                    className="bg-accent text-accent-foreground hover:bg-accent/90 glow-amber font-semibold gap-2"
                  >
                    <AlertTriangle className="w-4 h-4" /> Simulate Break
                  </Button>
                </motion.div>
              )}

              {phase === "broken" && (
                <motion.div
                  key="broken"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-2"
                >
                  <div className="text-destructive">
                    ✗ Error: Element not found: .btn-primary
                  </div>
                  <div className="text-destructive/70">
                    {" "}
                    at login.spec.ts:7:3
                  </div>
                  <div className="text-accent mt-4">
                    ⚡ Healer Agent dispatched...
                  </div>
                </motion.div>
              )}

              {(phase === "healing" || phase === "healed") && (
                <motion.div
                  key="healing"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-1"
                >
                  {healCode
                    .slice(0, phase === "healed" ? healCode.length : healLine)
                    .map((line, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={
                          line.startsWith("//")
                            ? "text-secondary"
                            : "text-foreground/80"
                        }
                      >
                        <span className="text-muted-foreground/40 mr-3 select-none">
                          {i + 1}
                        </span>
                        {line}
                      </motion.div>
                    ))}
                  {phase === "healing" && healLine < healCode.length && (
                    <span
                      className="inline-block w-[2px] h-4 bg-primary ml-6"
                      style={{ animation: "typing-cursor 1s infinite" }}
                    />
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Slack notification */}
        <AnimatePresence>
          {phase === "healed" && (
            <motion.div
              initial={{ opacity: 0, y: 20, x: 20 }}
              animate={{ opacity: 1, y: 0, x: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="absolute bottom-4 right-4 glass rounded-xl neon-border p-4 max-w-[260px] glow-emerald"
            >
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-secondary" />
                <span className="text-xs font-semibold text-foreground">
                  #sentinel-alerts
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                <span className="text-secondary font-semibold">
                  Healer Agent:
                </span>{" "}
                Fixed broken selector in{" "}
                <span className="text-foreground">login.spec.ts</span>. New
                selector:{" "}
                <code className="text-primary">
                  button[data-testid=&apos;submit&apos;]
                </code>
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
