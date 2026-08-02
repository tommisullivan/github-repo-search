import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/csp";

const nextConfig: NextConfig = {
  // SEC-01: the per-deployment-constant security headers. Values and reasons
  // live in `src/lib/csp.ts` (single source of truth — imported, not
  // mirrored). Two deliberate absences (D4-07):
  // - No Content-Security-Policy here: it carries a per-request nonce, which
  //   a static header cannot, so it is set by `src/proxy.ts`. The docs'
  //   no-nonce headers() path would require `script-src 'unsafe-inline'` —
  //   exactly what SEC-01 forbids.
  // - Strict-Transport-Security is meaningful only once served over HTTPS
  //   from a real domain; browsers ignore it on plain-HTTP responses, so it
  //   ships inert locally and binds on deployment.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [...staticSecurityHeaders],
      },
    ];
  },
  // SEC-02: `next/image` will fetch and re-serve any URL passed to its `src`
  // prop, which effectively turns the Next image optimiser into an image proxy
  // for whatever host is allowed here. `remotePatterns` is the framework's
  // allowlist and the *only* thing standing between a legitimate avatar URL
  // and an arbitrary remote fetch.
  //
  // Scoped deliberately narrow. The app displays exactly one class of remote
  // image — owner avatars from `avatars.githubusercontent.com` — so a wildcard
  // (`**.githubusercontent.com`, or worse, no `hostname`) would open up hosts
  // this app has no reason to reach. `pathname` is intentionally absent
  // because GitHub's avatar URL shapes vary; pinning it would break the first
  // time GitHub renames a bucket. See docs/SECURITY.md for the model.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
};

export default nextConfig;
