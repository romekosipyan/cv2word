# ResumeToWord

Convert a resume PDF into an editable Word document (DOCX) you can review and update in a familiar editor.

Upload one PDF, convert it, download `resume-editable.docx`, then review locally. Formatting may change — always check the result before you send it to an employer.

## What it does

- Accepts a single resume PDF (anonymous, no account)
- Returns editable native DOCX text (not image-only pages)
- Surfaces honest quality warnings when layout, fonts, or columns may need review
- Deletes uploaded and output files after use or automatic expiry

## Supported in P0

| | |
|---|---|
| Input | PDF only |
| Output | Editable DOCX |
| Size | Up to 10 MiB |
| Pages | 1–5 |
| Layout | Single-column baseline; two-column best effort |

Not supported yet: scanned/image-only PDFs, encrypted files, password handling, bulk conversion, or accounts.

## Honesty and privacy

- No “perfect layout,” “100% accurate,” or “ATS guaranteed” claims
- Files are processed only to convert — not for training, ads, or profiling
- Job access uses high-entropy secrets; a job ID alone is not enough

## Project layout

```
apps/web/          Next.js marketing, converter UI, job API
workers/convert/   Isolated Python conversion workers
infra/             Queue, storage, and worker runtime
```

## License

[MIT](LICENSE)
