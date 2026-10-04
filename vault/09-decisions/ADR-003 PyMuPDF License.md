---
type: decision
id: ADR-003
status: accepted
chosen_option: A-AGPL
human_reviewer: product owner (accepted in product session 2026-10-04)
tags:
  - adr
  - license
aliases:
  - ADR-003 PyMuPDF License
---

# ADR-003 PyMuPDF license

## Status

**accepted — Option A (AGPL).** Product owner accepted AGPL for PyMuPDF and an open-source product posture, with the explicit product goal that the service may still be sold. Accepted 2026-10-04. This note is not legal advice or a license grant from Artifex; compliance steps below remain engineering/product obligations.

| Field | Value |
|---|---|
| `human_reviewer` | product owner (session 2026-10-04) |
| Chosen route | **Option A — AGPLv3** (open-source PyMuPDF) |
| Pinned PyMuPDF (US-070) | `1.28.2` |
| Vendor licensing page | [https://pymupdf.io/licensing](https://pymupdf.io/licensing) |

## Constraint — public worker image

Public / customer-reachable convert worker images that embed PyMuPDF may proceed under this accepted AGPL route **only with** a documented corresponding-source offer and notice policy (see Compliance residuals). Local spike harness under `workers/convert/spike/` remains measurement-only until the worker story ships those artifacts. [[US-010]] is unblocked for implementation.

## Context

ResumeToWord P0 inspects PDFs with PyMuPDF and reconstructs DOCX with pdf2docx in isolated Python workers ([[SPEC-WORKER]], [[Architecture]]). The Week 1 spike ([[US-070]]) pinned and ran:

| Package | Pinned |
|---|---|
| PyMuPDF | `1.28.2` |
| pdf2docx | `0.5.13` |
| python-docx | `1.2.0` |

Evidence: `workers/convert/spike/RESULTS.md`. This ADR does not re-score fidelity.

Vendor source for terms framing (fetched 2026-10-03): [PyMuPDF Licensing](https://pymupdf.io/licensing). That page contrasts AGPLv3 (open / reciprocal) with commercial licensing aimed at SaaS, OEM, and proprietary deployments.

## Options compared

### Option A — AGPLv3 (open-source PyMuPDF) — **chosen**

Use the AGPL build of PyMuPDF under AGPLv3 reciprocal obligations.

**Product acceptance (2026-10-04):** Owner accepts AGPL and making ResumeToWord source open, provided the product can still be sold. Selling AGPL-licensed software is a normal commercial model; the reciprocal obligation is corresponding source under AGPL terms, not a ban on paid hosted service. Exact compliance scope for the networked combination remains an owner/counsel checklist (not resolved solely by this ADR).

**Engineering reading of vendor page — not counsel opinion:**

- **Networked use / source disclosure.** If the AGPL version is deployed in a networked product, users interacting with it must receive the corresponding source code under the AGPL ([licensing](https://pymupdf.io/licensing) — “Source Code Disclosure”).
- **Modifications stay open.** Modified versions of the open-source code must also be distributed under AGPL terms.
- **Producer notice.** Preserve relevant copyright and producer metadata in generated PDFs and document output from the AGPL build where required. P0 strips unsafe metadata from outputs ([[SPEC-WORKER]]); reconcile notice obligations with that strip policy before public launch.
- Isolating PyMuPDF in a container does **not** by itself erase AGPL analysis for a SaaS.

### Option B — Commercial license (Artifex / PyMuPDF commercial) — not chosen

Obtaining a commercial license so proprietary code can stay closed without AGPL source-disclosure obligations. Engineering previously recommended B for a closed SaaS; product instead chose open-source + sellable service under A.

### Option C — Replace PyMuPDF before shipping — not chosen

Swap the inspect engine for a differently licensed library. Kept only as a last resort if AGPL compliance becomes unacceptable later.

## Recommendation history

Engineering had recommended Option B (2026-10-03). Product overrode that recommendation and accepted **Option A** on 2026-10-04.

## Compliance residuals (launch checklist — not US-010 coding blockers)

Record and complete before public MVP / marketing claims of “open source”:

1. **Corresponding source offer** — how users get the AGPL corresponding source for the networked convert stack (repo URL, archive, or written offer), including modifications.
2. **LICENSE / NOTICE** — repo root and worker image labels reflecting AGPL obligations for PyMuPDF and any AGPL-combined works as determined by the owner.
3. **Producer notice vs metadata strip** — reconcile [[SPEC-WORKER]] unsafe-metadata strip with AGPL producer-notice requirements; counsel or owner sign-off.
4. **Support boundaries** — AGPL path has no vendor support under the free license framing; ops/support is in-house ([[US-101]] / support content).

Track residuals on [[US-111]] / launch checklist as needed. Do not block [[US-010]] coding on counsel engagement once Option A is accepted; do block **public launch marketing** that misstates license terms.

## Deployment gate

| Gate | Rule |
|---|---|
| Public / registry worker image | Allowed under Option A with source-offer + notice policy in place before customer traffic |
| [[US-010]] convert worker implementation | **Unblocked** |
| Local spike / CI harness using pinned wheels | Allowed |
| Claiming commercial PyMuPDF license | Forbidden — route is AGPL |
| Claiming “we are licensed” without source offer | Forbidden until residuals above are done |

## Evidence

- Vendor: [https://pymupdf.io/licensing](https://pymupdf.io/licensing) (accessed 2026-10-03)
- Spike pins: `workers/convert/spike/RESULTS.md` — PyMuPDF `1.28.2`
- Spec gate: [[SPEC-WORKER]]
- Story: [[US-071]]
- Acceptance: product owner session 2026-10-04 — Option A; open source OK; selling OK

## Decision

**Accepted Option A (AGPL)** for PyMuPDF `1.28.2`. Product will open-source under AGPL reciprocal terms and may sell the hosted product. Commercial Option B is not pursued unless a later ADR revisits. Status: **accepted**.
