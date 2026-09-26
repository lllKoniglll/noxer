import { NextRequest, NextResponse } from "next/server";
import { forwardIdentityHeaders } from "@/lib/server/identity-headers";

const BACKEND = (process.env.AGENT_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

export async function GET(request: NextRequest) {
  const response = await fetch(`${BACKEND}/categories`, { headers: forwardIdentityHeaders(request), cache: "no-store" });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}

export async function PUT(request: NextRequest) {
  const headers = forwardIdentityHeaders(request);
  headers.set("content-type", "application/json");
  const response = await fetch(`${BACKEND}/categories`, {
    method: "PUT",
    headers,
    body: await request.arrayBuffer(),
    cache: "no-store"
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
