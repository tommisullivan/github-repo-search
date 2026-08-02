import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildCsp } from "@/lib/csp";

// SEC-01: per-request nonce generation for the Content-Security-Policy.
//
// Why a proxy and not `next.config.ts` `headers()`: a static header cannot
// carry a per-request nonce, and Next's documented no-nonce path requires
// `script-src 'unsafe-inline'` — forbidden by SEC-01 (D4-05). This file is
// Next 16's `proxy` convention (middleware was renamed; see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).
//
// Mechanism (Next's CSP guide): the nonce goes into BOTH the response CSP
// header (what the browser enforces) and the forwarded request headers (what
// Next's renderer reads — it parses the CSP header for `'nonce-{value}'` and
// attaches the nonce to framework scripts, bundles, and its own inline
// scripts automatically). `x-nonce` is additionally forwarded so a Server
// Component could read the nonce via `headers()` if it ever needs to.
//
// Policy construction is delegated to the pure, unit-tested builder in
// `src/lib/csp.ts` — this file stays a thin application shell.

export function proxy(request: NextRequest): NextResponse {
  // A v4 UUID has 122 bits of randomness from the platform CSPRNG; base64 of
  // its string form is the shape Next's own CSP guide uses.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const contentSecurityPolicy = buildCsp(
    nonce,
    process.env.NODE_ENV === "development"
  );

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api (no API routes exist, but keep the documented shape)
     * - _next/static (static files — no HTML, no nonce needed)
     * - _next/image (image optimization output)
     * - favicon.ico
     * and skip next/link prefetches: a prefetched page's nonce would be stale
     * by the time it is viewed, and Next re-renders on actual navigation.
     */
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
