#!/usr/bin/env bash
#
# Apply branch protection so a pull request cannot merge unless CI passes.
#
# Branch protection is a GitHub-side setting, not a file in the repository, so it
# cannot be committed — it has to be applied once against the remote. This script
# does that reproducibly instead of relying on someone clicking through settings.
#
# Usage:
#   .github/setup-branch-protection.sh [branch]      # defaults to main
#
# Requires the GitHub CLI, authenticated: gh auth login

set -euo pipefail

BRANCH="${1:-main}"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) is not installed — see https://cli.github.com" >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi

REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner)"
echo "Applying branch protection to ${REPO}@${BRANCH}"

# Only "CI Gate" is required. It aggregates every other job, so jobs can be added,
# renamed, or removed without touching this configuration. Requiring each job by
# name would mean a renamed job blocks every PR forever, waiting for a check that
# no longer reports.
gh api -X PUT "repos/${REPO}/branches/${BRANCH}/protection" \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["CI Gate"]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 0,
    "dismiss_stale_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

echo
echo "Applied to ${BRANCH}:"
echo "  - 'CI Gate' must pass before merge"
echo "  - branch must be up to date with base (strict)"
echo "  - applies to admins too (enforce_admins)"
echo "  - force pushes and branch deletion blocked"
echo "  - linear history required"
echo "  - review conversations must be resolved"
echo
echo "Verify: gh api repos/${REPO}/branches/${BRANCH}/protection | head -30"
