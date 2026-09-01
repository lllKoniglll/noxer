import { NextRequest, NextResponse } from "next/server";

const BACKEND = (process.env.AGENT_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");
const IDENTITY_HEADERS = [
  "x-authentik-username",
  "x-authentik-groups",
  "x-authentik-email",
  "x-authentik-uid"
];

function forwardHeaders(request: NextRequest) {
  const headers = new Headers();
  for (const name of IDENTITY_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

export async function GET(request: NextRequest) {
  const response = await fetch(`${BACKEND}/files`, { headers: forwardHeaders(request), cache: "no-store" });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}

export async function POST(request: NextRequest) {
  const response = await fetch(`${BACKEND}/files`, {
    method: "POST",
    headers: forwardHeaders(request),
    body: await request.arrayBuffer(),
    cache: "no-store"
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
