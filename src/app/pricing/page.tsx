"use client";

import { useState } from "react";
import { CheckCircle2, ArrowRight, Bot, GitBranch, Activity } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    badge: "For small teams",
    priceMonthly: 5,
    priceYearly: 4,
    description: "Perfect for trying SentinelQA on a single critical application.",
    highlight: "1 AI agent · great for pilots and side‑projects.",
    features: [
      "1 core SentinelQA agent (Architect or Scripter)",
      "Up to 2 connected repos",
      "3k pipeline runs / month",
      "GitHub integration",
      "Email support",
    ],
  },
  {
    id: "growth",
    name: "Growth",
    badge: "Most popular",
    priceMonthly: 25,
    priceYearly: 20,
    description: "Turn your CI into an autonomous QA pipeline with a squad of agents.",
    highlight: "Architect + Scripter + Watchdog, tuned for product teams.",
    features: [
      "3 coordinated agents (Architect, Scripter, Watchdog)",
      "Unlimited connected repos",
      "20k pipeline runs / month",
      "Automatic flaky‑test detection",
      "Slack notifications & RCA summaries",
      "Priority support",
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    badge: "For large orgs",
    priceMonthly: 100,
    priceYearly: 80,
    description: "A full agent grid with guardrails, governance, and custom integrations.",
    highlight: "All 5 agents (including Healer & Courier) plus custom MCPs.",
    features: [
      "Up to 15 SentinelQA agents across squads",
      "Unlimited pipeline runs",
      "Custom MCP & data‑plane integrations",
      "Fine‑grained policy & approval workflows",
      "Dedicated solutions engineer",
      "SLA‑backed support & SSO",
    ],
  },
] as const;

export default function PricingPage() {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-background/95 text-foreground">
      <div className="max-w-6xl mx-auto px-4 py-10 md:py-14">
        {/* Header */}
        <div className="flex items-center justify-between gap-6 mb-10">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1 rounded-full border border-border/40 bg-muted/40 text-muted-foreground mb-3">
              <Activity className="w-3 h-3 text-primary" />
              Pricing
              <span className="w-1 h-1 rounded-full bg-secondary animate-pulse" />
              Agents online · 5/5
            </p>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight mb-2">
              Choose the right SentinelQA subscription
            </h1>
            <p className="text-sm md:text-base text-muted-foreground max-w-xl">
              Start small with a single agent or roll out a full multi‑agent grid that writes,
              heals, and observes your tests across every repo.
            </p>
          </div>
          <div className="hidden md:flex flex-col items-end gap-2 text-xs text-muted-foreground">
            <span className="font-mono">
              <span className="text-secondary">●</span> Live workspace pricing
            </span>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1 text-primary hover:text-primary/80"
            >
              Open dashboard
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>

        {/* Billing toggle */}
        <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Bot className="w-4 h-4 text-primary" />
            <span>Pricing is per workspace — unlimited human users.</span>
          </div>
          <div className="inline-flex items-center rounded-full border border-border/50 bg-muted/40 p-1 text-xs">
            <button
              type="button"
              onClick={() => setBilling("monthly")}
              className={`px-3 py-1 rounded-full transition-colors ${
                billing === "monthly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setBilling("yearly")}
              className={`px-3 py-1 rounded-full transition-colors flex items-center gap-1 ${
                billing === "yearly"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              Yearly
              <span className="text-[10px] text-emerald-400 font-semibold">Save 20%</span>
            </button>
          </div>
        </div>

        {/* Plans grid */}
        <div className="grid md:grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => {
            const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
            const suffix = billing === "monthly" ? "/mo" : "/mo billed yearly";
            const isSelected = selectedPlanId === plan.id;

            return (
              <div
                key={plan.id}
                className={`relative glass rounded-2xl border p-5 flex flex-col h-full transition-colors ${
                  isSelected
                    ? "border-primary/60 bg-primary/10 shadow-[0_0_40px_rgba(56,189,248,0.25)]"
                    : "border-border/40"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div>
                    <p className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/60 border border-border/40 text-muted-foreground mb-2">
                      {plan.badge}
                    </p>
                    <h2 className="text-lg font-bold mb-1">{plan.name}</h2>
                    <p className="text-xs text-muted-foreground max-w-xs">{plan.description}</p>
                  </div>
                  {plan.id === "growth" && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                      Recommended
                    </span>
                  )}
                </div>

                <div className="mb-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black tracking-tight">${price}</span>
                    <span className="text-xs text-muted-foreground">{suffix}</span>
                  </div>
                  <p className="text-[11px] text-emerald-400 mt-1">{plan.highlight}</p>
                </div>

                <div className="space-y-2 text-xs text-foreground/80 mb-4">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-emerald-400" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-3">
                  <Button
                    type="button"
                    onClick={() => setSelectedPlanId(plan.id)}
                    className={`w-full flex items-center justify-center gap-2 text-xs ${
                      isSelected
                        ? "glow-cyan bg-primary text-primary-foreground hover:bg-primary/90"
                        : "bg-muted text-foreground hover:bg-muted/80"
                    }`}
                  >
                    <GitBranch className="w-3 h-3" />
                    Start {plan.name}
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

