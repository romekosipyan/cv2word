---
type: decision
id: ADR-006
status: proposed
tags:
  - adr
aliases:
  - ADR-006 Editor Versions
---

# ADR-006 Editor versions

## Status

proposed — QA recommendation from [[US-073]]. Versions are **proposed until verified** in [[US-094]]. Product may swap channel (e.g. Monthly Enterprise) before beta.

## Context

[[SPEC-FIDELITY]] requires successful outputs to open without repair in a selected editor matrix. Exact builds must be named so [[US-094]] can produce repeatable evidence. Mobile Word and browser editors are out of P0 scope.

## Decision (proposed P0 matrix)

Canonical table: [[Editor Matrix]].

| Editor | Proposed version | OS assumption | Role |
|---|---|---|---|
| Microsoft Word (Microsoft 365 Apps) | Current Channel **Version 2609 (Build 20430.20092)** — published 2026-09-22 | Windows 11 24H2, x64, en-US | Primary gate |
| LibreOffice Writer | **26.2.6** (mature / Still branch as of 2026-09-24) | Windows 11 24H2, x64, en-US | Secondary gate |

### Rationale

- Word Current Channel 2609 matches the latest Microsoft 365 desktop Current Channel at policy authoring (2026-10-03). Resume users typically open DOCX in Word first.
- LibreOffice **26.2.6** (mature) is preferred over **26.8.x** (fresh latest) for a conservative open/edit gate. Fresh branch may be added later; it is not a P0 blocker.
- Same OS for both editors reduces “works on my Mac” ambiguity for the first verification pass. macOS Word / LibreOffice are non-blocking stretch checks, not launch gates.

### Verification rules ([[US-094]])

- Open without repair dialogs.
- Edit and save a role description (native text, not a floating text box only).
- ZIP integrity alone is insufficient.
- Font policy ([[ADR-005 Font Policy]]): output must not contain embedded font parts; editors resolve fonts from the OS / suite.

### Pinning discipline

Record the exact Help → About strings used during [[US-094]] in [[Editor Matrix]] evidence. If Microsoft ships a newer Current Channel before verification, re-pin the matrix to that build and re-run — do not silently claim an unverified build.

## Consequences

- QA lab (or reviewer machines) need Word 365 Current Channel and LibreOffice 26.2.6 on Windows 11.
- Launch checklist cites this ADR + matrix; public copy must not claim “all Word versions” or “all LibreOffice versions.”

## Alternatives considered

| Option | Why not for P0 |
|---|---|
| Word Online / LO Online only | Editability and repair behavior differ; desktop is the fidelity contract |
| Office 2024 LTSC only | Misses Microsoft 365 channel most consumers run |
| LibreOffice 26.8.1 as sole LO gate | Newer branch; mature 26.2.6 is safer for first pass |
| macOS as primary | Valid later; Windows-first keeps week-1/week-4 cost down |
