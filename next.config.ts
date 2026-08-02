import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
