# ResumeToWord web (job API)

Next.js App Router app hosting marketing pages and the **job API**. Conversion does not run here.

## Local setup

```bash
cd apps/web
cp .env.example .env.local
npm install
npm run dev
```

## Tests

```bash
cd apps/web
npm install
npm test
```

Uses Node’s built-in `node:sqlite` for opaque job metadata and a filesystem object-store adapter for local upload PUT (`/api/dev/upload`).

## Auth model

- Anonymous session: HttpOnly `rtw_sid`
- Job bearer secret: issued once on `POST /api/jobs` (JSON `secret` + HttpOnly `rtw_job_{id}` cookie scoped to `/api/jobs/{id}`)
- Subsequent routes: `Authorization: Bearer <secret>` or the job cookie
- Job id alone never authorizes access
- Secrets are never accepted from query strings; only a hash is stored
