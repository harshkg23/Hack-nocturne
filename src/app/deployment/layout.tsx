import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Deployment — SentinelQA",
  description: "Canary deployment management with developer controls",
};

export default function DeploymentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
