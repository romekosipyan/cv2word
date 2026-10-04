---
type: quality
tags:
  - quality
  - acceptance
aliases:
  - Acceptance Criteria
---

# End-to-end acceptance

From the PRD. These are program-level gates, not a substitute for story AC.

1. Given a supported PDF, a keyboard user can upload, convert, download an editable DOCX, and receive the fidelity warning without registering.
2. Given forged MIME metadata, another job ID, or expired credentials, the server rejects access and serves no file bytes.
3. Given a repeated completion request or worker retry, only one logical job completes and quota is counted once.
4. Given delete during processing, access is revoked, no result is republished, and every derivative is removed within the tested deletion target.
5. Given a backend failure, the UI exits processing with an actionable message; monitoring receives only a sanitized error code.

See also [[Launch Review Checklist]].
