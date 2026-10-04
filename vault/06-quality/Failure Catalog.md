---
type: quality
tags:
  - quality
  - failures
aliases:
  - Failure Catalog
---

# Failure catalog

| Failure | Required behavior | Code |
|---|---|---|
| Wrong type, too large, too many pages | Reject before conversion; exact limit; allow reselection | `unsupported_type`, `too_large`, `too_many_pages` |
| Encrypted or corrupt PDF | Explain unsupported protection or unreadable file; suggest unlocked valid PDF | `encrypted`, `corrupt` |
| Scan or low text density | Explain possible image-based content; never empty success | `scan_detected` |
| Worker crash or timeout | Terminal failure after one infra retry; clean artifacts; offer new attempt | `conversion_failed` |
| Queue full or rate limit | Show retry timing; no indefinite spinner or charge | `queue_full`, `rate_limited` |
| Missing or invalid output | Block download; no parser details | `output_invalid` |
| Expired or unauthorized | Neutral unavailable; do not disclose another job | `expired`, `unauthorized` |
| Network loss or delete failure | Recover status with valid credentials; pending deletion; retry cleanup | `delete_pending` |

UI must exit processing with an actionable message. Monitoring receives only the sanitized code.
