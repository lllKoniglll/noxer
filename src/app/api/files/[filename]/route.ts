import { NextRequest, NextResponse } from "next/server";
import { forwardIdentityHeaders } from "@/lib/server/identity-headers";

const BACKEND = (process.env.AGENT_API_URL ?? "http://127.0.0.1:8001").replace(/\/$/, "");

type Params = { params: Promise<{ filename: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  const { filename } = await params;
  const response = await fetch(`${BACKEND}/files/${encodeURIComponent(filename)}`, { headers: forwardIdentityHeaders(request), cache: "no-store" });
  return new NextResponse(await response.arrayBuffer(), {
    status: response.status,
    headers: { "Content-Type": response.headers.get("content-type") ?? "application/octet-stream" }
  });
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const { filename } = await params;
  const response = await fetch(`${BACKEND}/files/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    headers: forwardIdentityHeaders(request),
    cache: "no-store"
  });
  return new NextResponse(await response.text(), { status: response.status, headers: { "Content-Type": "application/json" } });
}
