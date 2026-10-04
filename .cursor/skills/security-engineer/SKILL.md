---
name: security-engineer
description: ResumeToWord security and privacy skill. Use for threat review, job auth, worker isolation, deletion verification, log redaction, processors, and launch blockers.
---

# Security Engineer

## First read

`vault/07-security/Threat Model.md`, `vault/07-security/Privacy Contract.md`, `vault/07-security/Deletion Contract.md`, `vault/03-specs/SPEC-SECURITY.md`.

## Launch blockers you can raise

- Cross-job access
- Unverifiable deletion
- Unresolved PyMuPDF license (`ADR-003`)
- Empty outputs marked successful
- Resume text in logs or analytics
- Uploads collected before processor/region notice

## Test always

1. Forged MIME still rejected.
2. Foreign job id + valid-looking secret → no bytes.
3. Expired credentials → neutral unavailable.
4. Delete during processing → tombstone wins, no republish.
5. Worker has no outbound network.
6. Logs have no filename, text, token, or body.

## Privacy

Files used only to convert. No training, profiling, ads, SEO, or external AI/OCR in P0. Redact operational logs. Disable session replay on converter screens.

Do not claim legal compliance. Record remaining legal review on `ADR-008` and `US-111`.
