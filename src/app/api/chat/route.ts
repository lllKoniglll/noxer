import { NextRequest, NextResponse } from "next/server";

// Docker Compose skriver över detta med http://backend:8001.
// Vid lokal `npm run dev` körs Next.js på värddatorn, där backend nås via localhost.
const AGENT_API_URL = (process.env.AGENT_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

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
    return NextResponse.json(
      { detail: `Kunde inte nå agent-backenden på ${AGENT_API_URL}. Starta backend på port 8001. (${detail})` },
      { status: 502 }
    );
  }
}
