import { NextRequest, NextResponse } from "next/server";

const AGENT_API_URL = (process.env.AGENT_API_URL ?? "http://backend:8001").replace(/\/$/, "");

export async function POST(request: NextRequest) {
  try {
    const forwardedBody = await request.arrayBuffer();
    const response = await fetch(`${AGENT_API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": request.headers.get("content-type") ?? "application/json" },
      body: forwardedBody,
      cache: "no-store"
    });

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" }
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Backend kunde inte nås";
    return NextResponse.json({ detail }, { status: 502 });
  }
}
