"use client";

import { useState, Suspense, lazy } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  Shield,
  ArrowLeft,
  Loader2,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";

const NetworkMesh = lazy(() => import("@/components/NetworkMesh"));

// ─── OAuth Provider Icons ────────────────────────────────────────────────────

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
      <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
    </svg>
  );
}

function GitLabIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-[18px] h-[18px]" fill="currentColor">
      <path d="M22.65 14.39L12 22.13 1.35 14.39a.84.84 0 01-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 014.82 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0118.6 2a.43.43 0 01.58 0 .42.42 0 01.11.18l2.44 7.51L23 13.45a.84.84 0 01-.35.94z" />
    </svg>
  );
}

// ─── Alert Banner ────────────────────────────────────────────────────────────

function AlertBanner({ message }: { message: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -8, height: 0 }}
      transition={{ duration: 0.2 }}
      className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm mb-4 bg-destructive/10 border border-destructive/30 text-destructive"
    >
      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
      <span>{message}</span>
    </motion.div>
  );
}

// ─── OAuth Button ────────────────────────────────────────────────────────────

interface OAuthButtonProps {
  icon: React.ReactNode;
  label: string;
  provider: string;
  colorClass?: string;
  callbackUrl: string;
}

function OAuthButton({
  icon,
  label,
  provider,
  colorClass = "",
  callbackUrl,
}: OAuthButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    await signIn(provider, { callbackUrl });
    // signIn redirects, so setLoading(false) may never be reached — that's fine
  };

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`
        group relative flex items-center justify-center gap-2.5 w-full h-11
        rounded-xl border border-border/50 bg-card/30 backdrop-blur-sm
        text-sm font-medium text-foreground/80
        hover:bg-card/60 hover:border-border hover:text-foreground
        transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed
        ${colorClass}
      `}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      <span>{loading ? "Redirecting…" : label}</span>
    </button>
  );
}





// ─── Auth Page Shell (reads searchParams) ────────────────────────────────────

function AuthPageContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";
  const urlError = searchParams.get("error");

  // Map NextAuth error codes to human-readable messages
  const oauthErrorMessage =
    urlError === "OAuthAccountNotLinked"
      ? "This email is already registered with a different provider."
      : urlError === "OAuthSignin" || urlError === "OAuthCallback"
        ? "OAuth sign-in failed. Please try again."
        : urlError
          ? "Authentication error. Please try again."
          : null;

  const oauthProviders = [
    {
      icon: <GitHubIcon />,
      label: "Continue with GitHub",
      provider: "github",
      colorClass: "hover:border-foreground/30",
    },
    {
      icon: <GitLabIcon />,
      label: "Continue with GitLab",
      provider: "gitlab",
      colorClass: "hover:border-[#FC6D26]/40 [&>svg]:text-[#FC6D26]",
    },
  ];

  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center px-4">
      {/* 3D Background */}
      <Suspense fallback={null}>
        <NetworkMesh />
      </Suspense>

      {/* Top bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center h-16 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
          Back to home
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Shield className="w-6 h-6 text-primary" />
            <div className="absolute inset-0 bg-primary/20 rounded-full blur-lg" />
          </div>
          <span className="text-base font-bold tracking-tight text-foreground">
            Sentinel<span className="text-primary">QA</span>
          </span>
        </div>
      </div>

      {/* Auth card */}
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full max-w-[420px] pt-16"
      >
        {/* Ambient glow */}
        <div className="absolute -inset-px rounded-2xl bg-gradient-to-b from-primary/10 via-transparent to-secondary/10 blur-xl -z-10" />

        <div className="glass rounded-2xl neon-border overflow-hidden">
          {/* Card header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="relative">
                <Shield className="w-8 h-8 text-primary" />
                <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl animate-pulse" />
              </div>
              <span className="text-xl font-black tracking-tight text-foreground">
                Sentinel<span className="text-gradient-cyan">QA</span>
              </span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-1">
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your autonomous testing platform
            </p>
          </div>

          {/* Tab switcher */}
          <div className="mx-8 mb-6">
            <div className="relative flex bg-muted/30 rounded-xl p-1 gap-1">
              <motion.div
                className="absolute top-1 bottom-1 rounded-[10px] bg-primary/15 border border-primary/30"
                animate={{
                  left: tab === "login" ? "4px" : "50%",
                  width: "calc(50% - 4px)",
                }}
                transition={{ type: "spring", stiffness: 400, damping: 35 }}
              />
              {(["login", "signup"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`
                    relative flex-1 py-2.5 text-sm font-semibold rounded-[10px] transition-colors duration-200
                    ${tab === t ? "text-primary" : "text-muted-foreground hover:text-foreground"}
                  `}
                >
                  {t === "login" ? "Sign-In-Broken" : "Sign Up"}
                </button>
              ))}
            </div>
          </div>

          {/* Form area */}
          <div className="px-8 pb-8">
            {/* OAuth error from URL param */}
            <AnimatePresence>
              {oauthErrorMessage && (
                <AlertBanner message={oauthErrorMessage} />
              )}
            </AnimatePresence>

            {/* OAuth Buttons */}
            <div className="space-y-2.5">
              {oauthProviders.map((provider) => (
                <OAuthButton
                  key={provider.provider}
                  icon={provider.icon}
                  label={provider.label}
                  provider={provider.provider}
                  colorClass={provider.colorClass}
                  callbackUrl={callbackUrl}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Trust badge */}
        <div className="flex items-center justify-center gap-1.5 mt-4 mb-8">
          <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
          <span className="text-[11px] text-muted-foreground/50">
            Secured by SentinelQA · SOC 2 Type II Certified
          </span>
        </div>
      </motion.div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams() requires it in Next.js App Router
export default function AuthPage() {
  return (
    <Suspense fallback={null}>
      <AuthPageContent />
    </Suspense>
  );
}
