import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "healthy",
    service: "sentinelqa-app",
    version: "0.1.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
