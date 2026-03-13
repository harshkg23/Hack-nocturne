"use client";

import { motion } from "framer-motion";
import { Brain, PenTool, HeartPulse, Eye } from "lucide-react";

const agents = [
  {
    icon: Brain,
    name: "Planner",
    role: "Analyzes code diffs and plans test strategy",
    color: "primary",
  },
  {
    icon: PenTool,
    name: "Writer",
    role: "Generates Playwright tests from the plan",
    color: "primary",
  },
  {
    icon: HeartPulse,
    name: "Healer",
    role: "Detects broken selectors and self-heals tests",
    color: "accent",
  },
  {
    icon: Eye,
    name: "Observer",
    role: "Monitors metrics, latency, and pass rates",
    color: "secondary",
  },
];

export default function AgentSquad() {
  return (
    <section id="agents" className="relative z-10 py-24 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            The Agent <span className="text-gradient-cyan">Squad</span>
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Four specialized AI agents working in concert.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {agents.map((agent, i) => {
            const Icon = agent.icon;
            return (
              <motion.div
                key={agent.name}
                initial={{ opacity: 0, scale: 0.9 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="flex flex-col items-center text-center group"
              >
                {/* Avatar with liveness ring */}
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full glass neon-border flex items-center justify-center group-hover:glow-cyan transition-all duration-500">
                    <Icon className="w-8 h-8 text-primary" />
                  </div>
                  {/* Liveness ring */}
                  <div
                    className="absolute inset-0 rounded-full border-2 border-primary/40"
                    style={{ animation: "liveness-ring 2.5s infinite" }}
                  />
                  {/* Online dot */}
                  <div className="absolute bottom-0 right-0 w-4 h-4 rounded-full bg-secondary border-2 border-background" />
                </div>
                <h3 className="text-sm font-bold text-foreground mb-1">
                  {agent.name}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {agent.role}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Connection lines (SVG) */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-10 hidden md:block"
          aria-hidden
        >
          <line
            x1="25%"
            y1="50%"
            x2="50%"
            y2="50%"
            stroke="hsl(187, 92%, 53%)"
            strokeWidth="1"
          />
          <line
            x1="50%"
            y1="50%"
            x2="75%"
            y2="50%"
            stroke="hsl(187, 92%, 53%)"
            strokeWidth="1"
          />
        </svg>
      </div>
    </section>
  );
}
