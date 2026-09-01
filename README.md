# ML’s (Midnight Legend’s)

ML’s is a responsive, account-scoped file upload hub for securely storing and sharing creative work, documents, media, archives, and code. The interface is intentionally calm and focused: upload from a file picker or by dragging files into the vault, then search, download, share, or remove them from one personal library.

## What is included

The app uses Manus OAuth for sign-in, a MySQL-compatible database for file metadata, and the platform’s S3-compatible object-storage helpers for file bytes. The database stores the owner ID, original filename, size, MIME type, storage key, upload timestamp, and optional share token. **File bytes are never stored in the database.**

| Capability | Implementation |
| --- | --- |
| Uploads | Drag-and-drop and multi-file picker with per-file progress, success, and error states |
| Supported content | Documents, images, archives, audio, video, code, and arbitrary browser-recognized file types |
| Authentication | Manus OAuth; uploads and personal library procedures require a signed-in user |
| Storage | Secure S3-compatible storage through `storagePut` and signed delivery URLs |
| Library | Search, type indicators, download, optional share links, and ownership-safe deletion |
| Limits | 250 MB per file by default; change the server and client constants together if needed |

## Local development

The project is a React 19 + Tailwind 4 + Express + tRPC application managed with pnpm.

```bash
pnpm install
pnpm dev
```

The managed environment supplies the platform variables listed below. Do not commit a `.env` file or place credentials in client-side source code.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | MySQL/TiDB-compatible database connection string |
| `JWT_SECRET` | Session cookie signing secret |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | Manus sign-in portal URL |
| `BUILT_IN_FORGE_API_URL` | Platform API endpoint used for storage presigning |
| `BUILT_IN_FORGE_API_KEY` | Server-only credential for storage operations |

## Storage and sharing model

Browser uploads use a same-origin binary endpoint at `POST /api/files/upload`. The server authenticates the session, sanitizes the filename, uploads the bytes through the preconfigured S3-compatible helper, and writes metadata to the `files` table. Personal downloads first verify ownership through a protected tRPC procedure and then receive a signed delivery URL. A share link is created only after the owner explicitly enables sharing; disabling sharing clears the token and makes the public route unavailable.

Deleting a library row intentionally removes the application reference without attempting to delete the underlying object, matching the platform storage contract. For production retention and storage-cost policies, add a separate reviewed cleanup process rather than deleting objects during a user request.

## Database changes

The file table is defined in `drizzle/schema.ts`. To generate a migration after schema edits:

```bash
pnpm drizzle-kit generate
```

Review the SQL before applying it through the project’s database migration workflow. Never store file content in a database BLOB column.

## Validation

```bash
pnpm check
pnpm test
pnpm build
```

The included tests verify that personal library reads and download-link creation reject anonymous callers. Browser validation should additionally cover a signed-in upload, a failed upload, search, download, share-link copy, share disabling, and deletion.

## Deployment

For the simplest production path, keep the project on the managed full-stack hosting provided by the project workspace. First run the validation commands, create a checkpoint, and use the project’s **Publish** action. Configure the production environment with the same server-side and frontend variables used locally, especially `DATABASE_URL`, `JWT_SECRET`, `VITE_APP_ID`, `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`, `BUILT_IN_FORGE_API_URL`, and `BUILT_IN_FORGE_API_KEY`. After publishing, verify OAuth sign-in, a small upload, a private download, a share-link redirect, and deletion in the live URL.

If deploying the repository to another Node-compatible host, use the existing `pnpm build` output and start command:

```bash
pnpm install --frozen-lockfile
pnpm build
NODE_ENV=production pnpm start
```

The host must provide a persistent MySQL/TiDB-compatible database, HTTPS cookies, the required OAuth redirect configuration, and all environment variables above at runtime. Do not expose `BUILT_IN_FORGE_API_KEY` to browser code. Configure the OAuth callback as `<your-production-origin>/api/oauth/callback`, and ensure the host forwards `/api/*` requests to the same Node process that serves the built frontend.

## GitHub publishing

Create a private repository by default, review the generated README and environment guidance, then push the project with GitHub CLI:

```bash
gh repo create ml-midnight-legends --private --source=. --remote=origin --push
```

Before making the repository public, review project configuration, logs, and environment handling to confirm that no credentials, uploaded content, or private storage URLs are committed.
