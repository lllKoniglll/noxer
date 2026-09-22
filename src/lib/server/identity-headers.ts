import { NextRequest } from "next/server";

const IDENTITY_HEADERS = [
  "x-authentik-username",
  "x-authentik-groups",
  "x-authentik-email",
  "x-authentik-uid"
];

export function forwardIdentityHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  for (const name of IDENTITY_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  // Local development has no Authentik/Caddy in front of Next.js. Keep this
  // opt-in and development-only so production still relies on the trusted proxy.
  if (process.env.NODE_ENV !== "production") {
    const username = process.env.NOXER_LOCAL_DEV_USERNAME;
    const group = process.env.NOXER_LOCAL_DEV_GROUP;
    if (username && group) {
      if (!headers.has("x-authentik-username")) headers.set("x-authentik-username", username);
      if (!headers.has("x-authentik-groups")) headers.set("x-authentik-groups", group);
    }
  }

  return headers;
}
